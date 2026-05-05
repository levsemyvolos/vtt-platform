# Локальна перевірка FoW (ізольовано від main)

Цей worktree запускається на **окремих портах** і **окремій БД**, тож main worktree (на 4000/5173, БД `vtt_dev`) залишається недоторканим.

| Що | Main worktree | FOW worktree |
|---|---|---|
| Server port | 4000 | **4001** |
| Client port | 5173 | **5174** |
| DB name    | `vtt_dev` | **`vtt_fow_test`** |

## Один раз — налаштування

```bash
# З папки worktree (.claude/worktrees/hardcore-easley-61d89b)

# 1. Переконайтесь, що postgres-контейнер з main стека піднятий:
#    (запускається з кореня репо vtt-platform/)
#    docker compose up -d postgres

# 2. Створити окрему БД та накатати міграції:
bash scripts/bootstrap-fow.sh
```

Якщо під Windows `bash` недоступний у PATH, виконайте кроки вручну з PowerShell:

```powershell
# 1. Знайти ім'я postgres-контейнера
docker ps --format "{{.Names}}" --filter "ancestor=postgres:16-alpine"

# 2. Підставити його замість <name> і створити БД (одноразово)
docker exec -u postgres <name> psql -c "CREATE DATABASE vtt_fow_test OWNER vtt;"

# 3. Накатити міграції цього worktree
pnpm --filter @vtt/server exec prisma migrate deploy
pnpm --filter @vtt/server exec prisma generate
```

## Запуск (два термінали)

```bash
# Терміналі 1 — сервер на 4001
pnpm --filter @vtt/server dev

# Терміналі 2 — клієнт на 5174
pnpm --filter @vtt/client dev
```

Відкрити **http://localhost:5174** у двох вікнах браузера (краще різні профілі, щоб мати дві сесії одночасно — GM + Player).

## Сценарій перевірки

1. **GM реєструється/логіниться**, створює Room, заходить у Game Room.
2. **Player** (друге вікно) реєструється з іншим email і приєднується по invite-link.
3. GM створює Scene, активує її. Player бачить сцену.
4. GM активує **Fog tool** (хмара в toolbar). З'являється плаваюча панель ліворуч.
5. **Перевірити drag-marquee**: затиснути ЛКМ, потягнути по канвасі → з'явиться dashed-rectangle (червоний у режимі Hide). Відпустити → область чорніє pixel-precision.
6. **Перевірити Reveal**: у панелі вибрати `Reveal`, drag всередині прихованої зони → вирізає вікно. Курсор і прев'ю стають зеленими.
7. **Перевірити sync**: Player миттєво бачить зміни без F5.
8. **Hide All / Reveal All / Undo last** з панелі.
9. **GM opacity slider** — впливає тільки на GM-вид; у Player завжди повний фог.
10. **Краї без швів**: drag два сусідніх прямокутники в Hide — між ними не має бути видимої лінії.

## Очистка після

Зупинити обидва pnpm dev процеси (Ctrl+C). БД `vtt_fow_test` і файли .env / .env.local залишаться — вони не комітяться (`.gitignore`). Видалити БД, якщо більше не потрібна:

```powershell
docker exec -u postgres <name> psql -c "DROP DATABASE vtt_fow_test;"
```

Main worktree (4000/5173/vtt_dev) працює як і раніше — нічого з цього на нього не впливає.
