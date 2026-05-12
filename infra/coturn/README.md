# coturn TURN/STUN — GCP deployment

Розгортання TURN-вузла VTT-платформи на віртуальній машині Google Cloud у межах
безкоштовного пробного періоду ($300 / 90 днів). Цей файл є фактичною основою
для §3.4 «Інфраструктурне уявлення» і фіксує hardware/software-конфігурацію
вузла `TURN Server`.

## 1. Hardware/software-конфігурація вузла

| Параметр | Значення |
|---|---|
| Cloud / Region | Google Cloud Platform / `us-central1-f` |
| Machine type | `e2-micro` (2 vCPU burst, 1 GiB RAM, free trial) |
| OS | Debian 12 (bookworm) |
| Зовнішня IP | статична (Reserved External IP) |
| FQDN | `turn.vtt.example.com` (A-record на статичну IP) |
| coturn | 4.6.x (stock APT) |
| TLS | Let's Encrypt (certbot, ACME HTTP-01) |
| Систем-сервіс | `systemd` unit `coturn.service` |

## 2. Покрокове розгортання

### 2.1 VM + firewall
```bash
gcloud compute instances create vtt-turn \
  --zone=us-central1-f \
  --machine-type=e2-micro \
  --image-family=debian-12 --image-project=debian-cloud \
  --address=<reserved-ip>

gcloud compute firewall-rules create vtt-turn-udp-3478 \
  --direction=INGRESS --action=ALLOW --rules=udp:3478,tcp:3478 \
  --target-tags=vtt-turn
gcloud compute firewall-rules create vtt-turn-tls-5349 \
  --direction=INGRESS --action=ALLOW --rules=tcp:5349,udp:5349 \
  --target-tags=vtt-turn
gcloud compute firewall-rules create vtt-turn-relay \
  --direction=INGRESS --action=ALLOW --rules=udp:49152-65535 \
  --target-tags=vtt-turn
gcloud compute firewall-rules create vtt-turn-http01 \
  --direction=INGRESS --action=ALLOW --rules=tcp:80 \
  --target-tags=vtt-turn
```

### 2.2 Пакети
```bash
sudo apt update
sudo apt install -y coturn certbot
```

### 2.3 TLS-сертифікат (Let's Encrypt) + автоматичне поновлення

Первинне отримання сертифіката:

```bash
sudo systemctl stop coturn        # звільнити :80
sudo certbot certonly --standalone -d turn.vtt.example.com \
     --agree-tos --non-interactive --email ops@vtt.example.com
sudo systemctl enable certbot.timer
```

Поновлення кожні 60 днів виконує `certbot.timer` (поставляється з пакетом).
Щоб coturn підхоплював свіжий сертифікат без ручного рестарту, додаємо
deploy-hook:

```bash
sudo install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
sudo tee /etc/letsencrypt/renewal-hooks/deploy/restart-coturn.sh > /dev/null <<'EOF'
#!/bin/sh
# certbot викликає цей хук після успішного renew. RENEWED_DOMAINS
# містить тільки домени, для яких сертифікат справді оновився.
case "$RENEWED_DOMAINS" in
  *turn.vtt.example.com*) systemctl restart coturn ;;
esac
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/restart-coturn.sh
```

Перевірка dry-run без реального renew:

```bash
sudo certbot renew --dry-run
```

Лог `journalctl -u certbot.timer` має містити запис про виклик
`restart-coturn.sh`.

### 2.3.1 Systemd unit (override)

Stock-юніт `coturn.service` потребує одного коригування — додати залежність
від `network-online.target`, бо coturn у момент старту біндить статичну IP:

```bash
sudo systemctl edit coturn
# у редакторі ввести:
[Unit]
After=network-online.target
Wants=network-online.target

[Service]
Restart=on-failure
RestartSec=5s
```

`systemctl daemon-reload && systemctl restart coturn` — перевірити, що
сервіс піднімається після ребуту VM.

### 2.4 Конфіг
```bash
sudo cp turnserver.conf /etc/turnserver.conf
sudo sed -i "s/EXTERNAL_VM_IP/$(curl -s ifconfig.me)/" /etc/turnserver.conf
sudo sed -i "s/REPLACE_WITH_TURN_STATIC_AUTH_SECRET/$(openssl rand -hex 32)/" \
     /etc/turnserver.conf
sudo sed -i 's/^#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
sudo systemctl enable coturn
sudo systemctl restart coturn
```

Збережіть `static-auth-secret` у password manager — ним же має бути заповнений
`TURN_STATIC_AUTH_SECRET` у `.env` App Server (без цього HMAC не співпаде).

### 2.5 Верифікація
```bash
sudo systemctl status coturn
sudo journalctl -u coturn -f
```

Інтерактивна перевірка через
[Trickle ICE](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/):
ввести `turn:turn.vtt.example.com:3478?transport=udp` + згенерований
HMAC-username/credential, переконатися, що серед кандидатів з'являється запис
типу `relay`.

## 3. Інтеграція з App Server

`apps/server/src/services/TurnConfigProvider.ts` обчислює HMAC-SHA1 від
`<expiry>:<userId>` за тим самим `static-auth-secret`; REST `GET /turn-config`
(JWT-захищений) повертає клієнту `IceServer[]` з TTL 1 год. Клієнт передає
бандл у `new RTCPeerConnection({ iceServers })` (див.
`apps/client/src/infrastructure/webrtc/PeerManager.ts`).

## 4. Обмеження

- Вузол одиничний — без HA. Прийнятно для дипломного MVP, але для продакшену
  потрібен другий вузол + DNS-failover.
- Mesh-топологія розрахована на ≤ 6 учасників (§2.13.4). Подальше масштабування
  потребує SFU (mediasoup / Janus) — занотовано як TODO у
  `signaling.ts` і у roadmap §3.10.
- e2-micro має жорсткі лімити CPU credit: при > 4 одночасних relay-сесіях з
  активним відео можливе тротлінг. Для MVP-вертикалі (захист — дзвінок між
  двома вкладками) запасу достатньо.
