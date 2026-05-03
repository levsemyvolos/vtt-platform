# Obscure VTT — повний план імплементації hybrid design

**Статус:** ✅ дизайн затверджено (2026-05-03), готовий до фази implement
**Еталон:** [`_design_preview/`](.) · це source of truth, не видаляти
**Bible:** §3.6 потребує патчу у Phase 7

---

## TL;DR

7 фаз, кожна — окремий PR із чистим відкатом. **Phase 0–2 безпечні** (тільки CSS+токени+1 компонент). **Phase 3–5 локальні** (по одному компоненту). **Phase 6–7** — polish + Bible sync. Сумарно **5–8 робочих днів** для одного розробника.

```
Phase 0 → tokens + fonts + favicon + globals       (1 день, нульовий ризик)
Phase 1 → Logo dual sigil + Button + Input          (1 день)
Phase 2 → Header / ThemeToggle / PingMeter / a11y   (1 день)
Phase 3 → RoomCard / CreateRoomCard / SortDropdown  (1 день)
Phase 4 → InitiativeBar (ember rule) + HPBar        (1–2 дні)
Phase 5 → Atmospheric paper + grain (body)          (півдня)
Phase 6 → ::selection + sepia divider + StatusBadge (півдня)
Phase 7 → Bible §3.6 patch + screenshots            (півдня)
```

**PR-boundaries** — кожна фаза — окремий PR з тестами, сумісним зі старим UI, що дає змогу мерджити поетапно і не блокувати інші фічі.

---

## Source of truth — артефакти у `_design_preview/`

| Файл | Призначення | Коли використовувати |
|---|---|---|
| `index.html` | Стартова навігація | Перший вхід, демонстрація команді |
| `quick_wins_ash_and_dawn.html` | Концепт 01 розібраний | Архів думок (не імплементується) |
| `quick_wins_midnight_ritual.html` | Концепт 02 розібраний | Архів думок (не імплементується) |
| `quick_wins_hybrid.html` | **Design system** — фінальні правила | Eталон при імплементації — звіряємо точність |
| `prototype_dashboard.html` | **Живий прототип Dashboard** | Reference для Phase 3 — pixel-perfect target |
| `notes.html` | Інструмент нотаток | Якщо знадобиться нова сесія рішень |
| `favicon_obscure.svg` | Favicon для tab браузера | Phase 0 → `apps/client/public/` |
| `IMPLEMENTATION_PLAN.md` | Цей файл | Step-by-step migration guide |

**Не видаляти жоден файл.** Концепти Ash і Midnight — як архів альтернатив, корисні для future justification рішень.

---

## Phase 0 · Foundations (1 день)

### 0.1 — `apps/client/src/styles/tokens.css` (full replacement)

Повна заміна. Зберігаємо ім'я `--color-*` як alias до нової семантичної системи (для legacy сумісності).

```css
/* ============================================================
   tokens.css — Obscure VTT (dark) + Sacred Order (light)
   Source of truth: _design_preview/quick_wins_hybrid.html
   2026-05-03 sync
============================================================ */

:root {
  /* ============== SACRED ORDER (light, default) ============== */
  --bg-0: #f0e9d6;
  --bg-1: #e8e0cc;
  --bg-2: #ddd1b3;
  --bg-3: #c8b890;
  --line: #b8a578;
  --line-strong: #8a7a5a;

  --ink: #1c1408;
  --ink-mute: #5a4a30;
  --ink-faint: #8a7a5a;
  --ink-inverse: #f0e9d6;

  /* семантичні primary (rune-gold у sacred — leaf-gold) */
  --rune: #a87a14;                 /* leaf-gold — rare illuminated capitals */
  --primary: var(--rune);
  --primary-hi: #d4a830;

  /* vitality (життя на HP) — semantic gold, окремий токен */
  --vitality: #a87a14;
  --vitality-hi: #d4a830;

  /* активний хід в Initiative (Bloodborne torch) */
  --ember: #a8341a;
  --ember-hi: #c2421e;

  /* wound (HP only — never on button) */
  --blood: #6e1414;
  --blood-hi: #8a2818;

  --selection: var(--rune);

  /* ============== SHADOWS / SHAPES ============== */
  --shadow-engrave:
    inset 0 1px 0 rgba(255,255,255,.5),
    inset 0 -1px 0 rgba(106,74,14,.08);
  --shadow-cast:
    0 18px 36px -16px rgba(106,74,14,.30),
    0 6px 14px -8px rgba(106,74,14,.20);
  --halo-aureole: 0 0 38px -10px rgba(168,122,20,.25);

  /* ============== ATMOSPHERIC ============== */
  /* Sacred Dawn paper — cathedral light */
  --paper:
    radial-gradient(1100px 600px at 20% 0%,rgba(245,213,116,.32),transparent 60%),
    radial-gradient(900px 700px at 100% 30%,rgba(184,138,44,.14),transparent 65%),
    radial-gradient(700px 500px at 50% 110%,rgba(120,82,30,.10),transparent 60%),
    repeating-linear-gradient(115deg,rgba(106,74,14,.025) 0 1px,transparent 1px 5px),
    radial-gradient(circle at 50% 50%,#f3ead6 0%,#e6d6ad 100%);
  --grain:
    radial-gradient(1.5px 1.5px at 14% 9%,rgba(106,74,14,.10),transparent 50%),
    radial-gradient(1.5px 1.5px at 76% 24%,rgba(106,74,14,.07),transparent 50%),
    radial-gradient(1.5px 1.5px at 31% 64%,rgba(106,74,14,.09),transparent 50%),
    radial-gradient(1.5px 1.5px at 89% 86%,rgba(106,74,14,.06),transparent 50%);
  --grain-blend: overlay;
  --grain-opacity: 0.55;

  /* ============== TYPOGRAPHY ============== */
  --font-sans: 'Inter','Segoe UI',system-ui,-apple-system,sans-serif;
  --font-serif: 'Cormorant Garamond',Georgia,serif;
  --font-mono: 'JetBrains Mono','Fira Code','Consolas',monospace;

  --text-xs: 12px;  --text-sm: 14px;  --text-base: 16px;
  --text-lg: 20px;  --text-xl: 24px;  --text-2xl: 32px;  --text-3xl: 42px;

  --tracking-eyebrow: .20em;       /* було .15em */
  --tracking-mono-cap: .32em;      /* mono caps на кнопках */

  /* ============== SPACING / RADIUS ============== */
  --space-xs: 4px;   --space-sm: 8px;   --space-md: 12px;
  --space-lg: 16px;  --space-xl: 24px;  --space-2xl: 32px;  --space-3xl: 48px;

  --radius-sm: 2px;  --radius-md: 4px;  --radius-lg: 6px;
  --radius-xl: 12px; --radius-full: 9999px;

  --transition-fast: 150ms ease;
  --transition-base: 200ms ease;
  --transition-slow: 600ms cubic-bezier(.2,.7,.2,1);

  /* ============== Z-INDEX ============== */
  --z-background: -1;  --z-base: 0;     --z-elevated: 100;
  --z-sticky: 200;     --z-popover: 600;
  --z-modal-backdrop: 350; --z-modal: 400; --z-toast: 800;

  /* ============== LEGACY ALIASES (зворотня сумісність) ============== */
  --color-bg: var(--bg-0);
  --color-surface: var(--bg-1);
  --color-surface-elevated: var(--bg-2);
  --color-surface-hover: var(--bg-2);
  --color-border: var(--line);
  --color-border-strong: var(--line-strong);
  --color-text-primary: var(--ink);
  --color-text-secondary: var(--ink-mute);
  --color-text-muted: var(--ink-faint);
  --color-text-inverse: var(--ink-inverse);
  --color-primary: var(--primary);
  --color-primary-hover: var(--primary-hi);
  --color-primary-active: var(--ink);
  --color-primary-muted: var(--bg-2);
  --color-secondary: var(--ink-mute);
  --color-secondary-hover: var(--ink);
  --color-success: #2f7a4d;
  --color-success-bg: rgba(47,122,77,.12);
  --color-warning: var(--ember);
  --color-warning-bg: rgba(168,52,26,.10);
  --color-danger: var(--blood-hi);
  --color-danger-hover: var(--blood);
  --color-danger-bg: rgba(138,40,24,.10);
  --color-info: #2a4878;            /* azure для info-станів збережено */
  --color-info-bg: rgba(42,72,120,.10);
  --color-overlay: rgba(28,20,8,.55);
  --color-canvas-bg: var(--bg-0);
  --color-canvas-grid: rgba(28,20,8,.08);
  --color-fow-fill: var(--ink);
  --color-fow-alpha: 0.65;

  --shadow-sm: 0 1px 2px 0 rgba(28,20,8,.06);
  --shadow-md: var(--shadow-cast);
  --shadow-lg: 0 24px 48px -16px rgba(106,74,14,.40),0 8px 18px -10px rgba(106,74,14,.30);

  --focus-ring: 0 0 0 2px var(--bg-0), 0 0 0 4px var(--primary);
}

/* ============== OBSCURE (dark theme) ============== */
[data-theme="dark"] {
  --bg-0: #0a0c10;
  --bg-1: #131720;
  --bg-2: #1c2230;
  --bg-3: #262d3d;
  --line: #2d3340;
  --line-strong: #3a4252;

  --ink: #d4cfc0;
  --ink-mute: #8a8b88;
  --ink-faint: #5a5b58;
  --ink-inverse: #0a0c10;

  /* primary в dark = COLD STEEL (не gold, ось ключове) */
  --steel: #9eaab8;
  --steel-hi: #c2c8d0;
  --primary: var(--steel);
  --primary-hi: var(--steel-hi);

  /* gold ТІЛЬКИ для: logo core, vitality bar, ember-rule rune */
  --rune: #c8a55c;
  --vitality: #a8852c;
  --vitality-hi: #d8b56a;

  --ember: #b8341a;
  --ember-hi: #d8462a;

  --blood: #6e1411;
  --blood-hi: #c41a1a;

  --selection: var(--steel);

  --shadow-engrave:
    inset 0 1px 0 rgba(212,207,192,.04),
    inset 0 -1px 0 rgba(0,0,0,.6);
  --shadow-cast:
    0 24px 48px -16px rgba(0,0,0,.7),
    0 8px 18px -10px rgba(0,0,0,.6);
  --halo-aureole: 0 0 38px -10px rgba(158,170,184,.25);

  --paper:
    radial-gradient(700px 400px at 25% -5%,rgba(184,52,26,.05),transparent 60%),
    radial-gradient(500px 350px at 100% 30%,rgba(158,170,184,.04),transparent 60%),
    radial-gradient(500px 350px at 50% 110%,rgba(110,20,17,.07),transparent 60%),
    radial-gradient(circle at 50% 50%,#10131a 0%,#0a0c10 70%);
  --grain:
    radial-gradient(1px 1px at 18% 12%,rgba(212,207,192,.04),transparent 50%),
    radial-gradient(1px 1px at 82% 24%,rgba(212,207,192,.05),transparent 50%),
    radial-gradient(1px 1px at 38% 72%,rgba(212,207,192,.03),transparent 50%),
    radial-gradient(1px 1px at 91% 88%,rgba(212,207,192,.04),transparent 50%);
  --grain-blend: screen;
  --grain-opacity: 0.5;

  /* ============== ALIAS overrides ============== */
  --color-danger: var(--blood-hi);
  --color-warning: var(--ember-hi);
  --color-info: #6a9bd8;             /* legacy info — нейтральний blue */

  --shadow-sm: 0 1px 2px 0 rgba(0,0,0,.4);
  --shadow-md: var(--shadow-cast);
  --shadow-lg: 0 24px 48px -16px rgba(0,0,0,.8),0 8px 18px -10px rgba(0,0,0,.7);

  color-scheme: dark;
}

[data-theme="light"] { color-scheme: light; }
```

### 0.2 — `apps/client/src/styles/global.css` patches

Додати наступне в кінець файлу:

```css
/* === Hybrid utilities ============================================ */

body {
  background: var(--bg-0);
  background-image: var(--paper);
  font-family: var(--font-sans);
  transition: background-color var(--transition-slow), color var(--transition-slow);
}

body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: var(--z-background);
  background-image: var(--grain);
  background-size: 200px 200px;
  mix-blend-mode: var(--grain-blend);
  opacity: var(--grain-opacity);
}

/* Display headings — Cormorant */
h1, h2 {
  font-family: var(--font-serif);
  font-weight: 500;
  letter-spacing: -0.005em;
  line-height: 1.05;
}
h1 em, h2 em { font-style: italic; font-weight: 500; }

/* Eyebrow — оновлений (mono, 0.20em) */
.eyebrow {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
  font-weight: 500;
  color: var(--ink-mute);
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.eyebrow::before {
  content: '';
  width: 18px;
  height: 1px;
  background: currentColor;
  opacity: 0.5;
}
.eyebrow.accent { color: var(--primary); }
.eyebrow.accent::before { background: var(--primary); opacity: 0.7; }

/* Selection */
::selection { background: var(--selection); color: var(--bg-0); }

/* Sepia/leaf-gold divider for Landing */
hr.fold {
  border: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--primary), transparent);
  opacity: 0.4;
  margin: var(--space-lg) 0;
}

/* Focus visible */
:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
```

### 0.3 — `apps/client/index.html`

```html
<!doctype html>
<html lang="uk">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Obscure VTT</title>

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
  />

  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <meta name="theme-color" content="#0a0c10" />
  <meta name="description" content="Obscure VTT — платформа для настільних RPG: AI-помічник, відеозв'язок, 3D-кубики." />
</head>
<body>
  <script>
    (function () {
      try {
        var raw = localStorage.getItem('preferences');
        if (raw) {
          var parsed = JSON.parse(raw);
          var theme = parsed && parsed.theme;
          if (theme === 'dark' || theme === 'light') {
            document.documentElement.dataset.theme = theme;
            return;
          }
        }
      } catch (_) {}
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.dataset.theme = 'dark';
      }
    })();
  </script>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

### 0.4 — Favicon

```
cp _design_preview/favicon_obscure.svg apps/client/public/favicon.svg
```

### 0.5 — Hard-coded color audit

Перед мерджем фази 0 запустити:

```bash
# 1. Знайти hard-coded hex-кольори у CSS/TSX (легасі від попереднього концепту)
grep -rnE "#[0-9a-fA-F]{6}" apps/client/src \
  --include="*.css" --include="*.module.css" --include="*.tsx" \
  | grep -vE "tokens\.css|/\*|//"

# 2. Особливо звернути увагу на старі primary
grep -rnE "#c8a24a|#8c6e2a|#d97a6c|#b53a2b" apps/client/src

# 3. Шрифти
grep -rn "Inter\|font-family" apps/client/src --include="*.css"
```

Кожен hex з виводу — замінити на `var(--token)`. Створити issue для треку.

### Тести

```bash
pnpm --filter @vtt/client typecheck    # має бути 0 errors
pnpm --filter @vtt/client lint         # має бути 0 errors
pnpm --filter @vtt/client test         # існуючі тести проходять
pnpm --filter @vtt/client build        # bundle build OK
```

Manual smoke (10 хв):
- Відкрити Auth, Dashboard, GameRoom (хоч одна порожня кімната)
- Перемкнути тему — flash немає, transition smooth
- Console — без warnings про missing CSS variables

### Acceptance

- [ ] Усі сторінки рендеряться у обох темах без візуальних регресій
- [ ] Hard-coded hex audit — або всі замінено, або зафіксовано в issue з deadline
- [ ] Favicon у tab браузера — Obscure (золоте ядро на темному)
- [ ] WCAG AA: ink на bg-0 у обох темах ≥ 4.5:1 (перевірити Chrome DevTools → Elements → Accessibility)

### Rollback

`git revert <commit>` — повертає старі токени. Жоден компонент не торкався — повний відкат миттєвий.

---

## Phase 1 · Atomic components (1 день)

### 1.1 — `apps/client/src/components/ui/Logo.tsx`

**Повністю переписати.** Dual sigil (Oracle/Counselor), theme-conditional рендер.

```tsx
import { useEffect, useState } from 'react';
import styles from './Logo.module.css';

export interface LogoProps {
  /** Розмір сигіла в px. У Header за замовчанням 40, у Auth/Landing 180. */
  size?: number;
  /** Чи показувати текстовий бренд "Obscure VTT" + meta. */
  withText?: boolean;
}

export default function Logo({ size = 40, withText = true }: LogoProps) {
  return (
    <div className={styles.brand}>
      <div className={styles.sigil} style={{ width: size, height: size }}>
        <OracleSvg className={styles.oracle} />
        <CounselorSvg className={styles.counselor} />
      </div>
      {withText && (
        <div className={styles.text}>
          <div className={styles.name}>Obscure <em>VTT</em></div>
          <div className={styles.meta}>Virtual Tabletop · v1.0</div>
        </div>
      )}
    </div>
  );
}

function OracleSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="oracleCore" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFE39A" />
          <stop offset="60%" stopColor="#F0C560" />
          <stop offset="100%" stopColor="#C89B3C" stopOpacity="0.3" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="86" fill="none" stroke="#C89B3C" strokeOpacity="0.5" strokeWidth="1.4"/>
      <circle cx="100" cy="100" r="86" fill="none" stroke="#C89B3C" strokeOpacity="0.9" strokeWidth="1.6" strokeDasharray="2 22"/>
      <circle cx="100" cy="14" r="3" fill="#F0C560"/>
      <circle cx="186" cy="100" r="3" fill="#F0C560"/>
      <circle cx="100" cy="186" r="3" fill="#F0C560"/>
      <circle cx="14" cy="100" r="3" fill="#F0C560"/>
      <g stroke="#C89B3C" strokeOpacity="0.6" strokeWidth="1.2">
        <line x1="100" y1="22" x2="100" y2="42"/>
        <line x1="100" y1="158" x2="100" y2="178"/>
        <line x1="22" y1="100" x2="42" y2="100"/>
        <line x1="158" y1="100" x2="178" y2="100"/>
        <line x1="44" y1="44" x2="58" y2="58" strokeOpacity="0.4"/>
        <line x1="156" y1="44" x2="142" y2="58" strokeOpacity="0.4"/>
        <line x1="44" y1="156" x2="58" y2="142" strokeOpacity="0.4"/>
        <line x1="156" y1="156" x2="142" y2="142" strokeOpacity="0.4"/>
      </g>
      <circle cx="100" cy="100" r="60" fill="none" stroke="#F0C560" strokeOpacity="0.7" strokeWidth="1.2" strokeDasharray="4 5"/>
      <circle cx="100" cy="100" r="60" fill="none" stroke="#5A7BA8" strokeOpacity="0.35" strokeWidth="0.8" strokeDasharray="1 9"/>
      <g stroke="#C89B3C" strokeOpacity="0.55" strokeWidth="1.2" fill="none">
        <polygon points="100,52 144,124 56,124"/>
        <polygon points="100,148 56,76 144,76" strokeOpacity="0.3"/>
      </g>
      <circle cx="100" cy="100" r="22" fill="url(#oracleCore)"/>
      <circle cx="100" cy="100" r="6" fill="#FFF6D8"/>
    </svg>
  );
}

function CounselorSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 220" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="cnsCore" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFE9B0" />
          <stop offset="55%" stopColor="#C8932A" />
          <stop offset="100%" stopColor="#9A6E1A" stopOpacity="0.3" />
        </radialGradient>
      </defs>
      <g stroke="#9A6E1A" strokeOpacity="0.5" strokeWidth="1.2">
        <line x1="110" y1="14" x2="110" y2="34"/>
        <line x1="110" y1="186" x2="110" y2="206"/>
        <line x1="14" y1="110" x2="34" y2="110"/>
        <line x1="186" y1="110" x2="206" y2="110"/>
        <line x1="42" y1="42" x2="56" y2="56"/>
        <line x1="178" y1="42" x2="164" y2="56"/>
        <line x1="42" y1="178" x2="56" y2="164"/>
        <line x1="178" y1="178" x2="164" y2="164"/>
        <line x1="110" y1="38" x2="110" y2="50" strokeOpacity="0.3"/>
        <line x1="110" y1="170" x2="110" y2="182" strokeOpacity="0.3"/>
      </g>
      <g fill="none" stroke="#9A6E1A" strokeWidth="1.4" strokeOpacity="0.7">
        <ellipse cx="110" cy="62" rx="14" ry="34"/>
        <ellipse cx="110" cy="158" rx="14" ry="34"/>
        <ellipse cx="62" cy="110" rx="34" ry="14"/>
        <ellipse cx="158" cy="110" rx="34" ry="14"/>
        <g transform="rotate(45 110 110)">
          <ellipse cx="110" cy="62" rx="11" ry="28" strokeOpacity="0.5"/>
          <ellipse cx="110" cy="158" rx="11" ry="28" strokeOpacity="0.5"/>
          <ellipse cx="62" cy="110" rx="28" ry="11" strokeOpacity="0.5"/>
          <ellipse cx="158" cy="110" rx="28" ry="11" strokeOpacity="0.5"/>
        </g>
      </g>
      <circle cx="110" cy="110" r="44" fill="none" stroke="#C8932A" strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="3 6"/>
      <circle cx="110" cy="110" r="22" fill="url(#cnsCore)"/>
      <circle cx="110" cy="110" r="6" fill="#FFFAE0"/>
    </svg>
  );
}
```

**`Logo.module.css`:**

```css
.brand { display: flex; align-items: center; gap: 10px; }
.sigil { display: grid; place-items: center; flex-shrink: 0; position: relative; }
.sigil svg {
  width: 100%; height: 100%; display: block;
  position: absolute; top: 0; left: 0;
  transition: opacity 0.6s cubic-bezier(.2,.7,.2,1);
}
.oracle, .counselor { opacity: 0; }
:global([data-theme="dark"]) .oracle {
  opacity: 1;
  filter: drop-shadow(0 0 6px rgba(240,197,96,.4));
}
:global([data-theme="light"]) .counselor {
  opacity: 1;
  filter: drop-shadow(0 0 4px rgba(245,213,116,.6));
}
.text { line-height: 1.1; }
.name {
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 500;
  font-size: 18px;
  letter-spacing: 0.005em;
}
.name em { font-style: italic; }
.meta {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--ink-mute);
  margin-top: 2px;
}
```

### 1.2 — `apps/client/src/components/ui/Button.tsx`

**Поточний інтерфейс зберігаємо.** Стилі повністю замінюються.

```tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';
import styles from './Button.module.css';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'default', size = 'md', className, children, ...rest }, ref) => (
    <button
      ref={ref}
      className={clsx(styles.btn, styles[variant], styles[size], className)}
      {...rest}
    >
      {children}
    </button>
  )
);
Button.displayName = 'Button';
export default Button;
```

**`Button.module.css`:**

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  background: var(--bg-2);
  color: var(--ink-mute);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-weight: 500;
  letter-spacing: var(--tracking-mono-cap);
  text-transform: uppercase;
  cursor: pointer;
  box-shadow: var(--shadow-engrave);
  transition: all var(--transition-base);
}
.btn:hover:not(:disabled) {
  color: var(--ink);
  border-color: var(--line-strong);
  background: var(--bg-3);
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Sizes */
.sm { padding: 6px 14px; font-size: 10px; }
.md { padding: 9px 20px; font-size: 11px; }
.lg { padding: 11px 28px; font-size: 12px; }

/* Variants */
.primary {
  border-color: var(--primary);
  color: var(--ink);
  background: var(--bg-3);
  box-shadow: var(--shadow-engrave), var(--halo-aureole);
}
.primary:hover:not(:disabled) {
  box-shadow: var(--shadow-engrave),
              0 0 60px -8px color-mix(in srgb, var(--primary) 35%, transparent);
  transform: translateY(-1px);
}

.ghost {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}
.ghost:hover:not(:disabled) {
  background: var(--bg-2);
  border-color: var(--line);
}

/* Destructive — НЕ червоний fill (wound rule), стиль як default */
.destructive {
  /* успадковує дефолтний стиль */
}
.destructive:hover:not(:disabled) {
  border-color: var(--blood-hi);
  color: var(--blood-hi);
}
```

### 1.3 — `apps/client/src/components/ui/Input.tsx`

```tsx
import { forwardRef, type InputHTMLAttributes } from 'react';
import clsx from 'clsx';
import styles from './Input.module.css';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...rest }, ref) => (
  <input ref={ref} className={clsx(styles.input, className)} {...rest} />
));
Input.displayName = 'Input';
export default Input;
```

**`Input.module.css`:**

```css
.input {
  display: block;
  width: 100%;
  background: var(--bg-0);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  box-shadow: var(--shadow-engrave);
  transition: border-color var(--transition-base), box-shadow var(--transition-base);
}
.input::placeholder { color: var(--ink-faint); }
.input:focus {
  outline: 0;
  border-color: var(--primary);
  box-shadow: var(--shadow-engrave), 0 0 0 2px color-mix(in srgb, var(--primary) 15%, transparent);
}
.input:disabled { opacity: 0.5; cursor: not-allowed; }
```

### Тести

- `Button.test.tsx` — variant snapshot тести (default, primary, ghost, destructive)
- `Logo.test.tsx` — рендер з різними size + withText
- Manual: відкрити Auth → Logo великий 180px, відкрити Dashboard → 40px
- Theme switch → SVG плавно crossfade

### Rollback

Кожен компонент окремий. Logo legacy лишити в файлі `Logo.legacy.tsx` для безпечного rollback на 1 PR.

---

## Phase 2 · Layout primitives (1 день)

### 2.1 — `apps/client/src/components/Layout/Header.tsx`

```tsx
import Logo from '../ui/Logo';
import ThemeToggle from '../ui/ThemeToggle';
import PingMeter from '../ui/PingMeter';
import StatusBadge from '../ui/StatusBadge';
import UserMenu from './UserMenu';
import { useWebRTCStats } from '../../hooks/useWebRTCStats';
import { useOnlineUsers } from '../../hooks/useOnlineUsers';
import styles from './Header.module.css';

export default function Header() {
  const { rtt } = useWebRTCStats();
  const { count: onlineCount } = useOnlineUsers();

  return (
    <header className={styles.header}>
      <Logo size={40} withText />

      <div className={styles.spacer} />

      {rtt != null && <PingMeter rtt={rtt} />}
      {onlineCount > 0 && (
        <StatusBadge tone="live">
          {onlineCount} онлайн
        </StatusBadge>
      )}
      <ThemeToggle />
      <UserMenu />
    </header>
  );
}
```

**`Header.module.css`:**

```css
.header {
  display: flex;
  align-items: center;
  gap: var(--space-xl);
  padding: 14px var(--space-2xl);
  border-bottom: 1px solid var(--line);
  background: var(--bg-1);
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  box-shadow: 0 1px 0 rgba(255,255,255,.02), 0 6px 18px -10px rgba(0,0,0,.5);
}
.spacer { flex: 1; }
```

### 2.2 — `apps/client/src/components/ui/ThemeToggle.tsx`

```tsx
import { useTranslation } from 'react-i18next';
import { useThemePreference } from '../../hooks/useThemePreference';
import styles from './ThemeToggle.module.css';
import clsx from 'clsx';

export default function ThemeToggle() {
  const { theme, setTheme } = useThemePreference();
  const { t } = useTranslation('common');

  return (
    <div className={styles.toggle} role="radiogroup" aria-label={t('theme.label')}>
      <button
        className={clsx(theme === 'dark' && styles.on)}
        onClick={() => setTheme('dark')}
        aria-checked={theme === 'dark'}
        role="radio"
      >
        {t('theme.dark')}
      </button>
      <button
        className={clsx(theme === 'light' && styles.on)}
        onClick={() => setTheme('light')}
        aria-checked={theme === 'light'}
        role="radio"
      >
        {t('theme.light')}
      </button>
    </div>
  );
}
```

**`ThemeToggle.module.css`:**

```css
.toggle {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: var(--radius-full);
  padding: 3px;
  background: var(--bg-2);
  box-shadow: var(--shadow-engrave);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.toggle button {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--ink-mute);
  padding: 7px 14px;
  border-radius: var(--radius-full);
  cursor: pointer;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  transition: all var(--transition-base);
}
.on {
  background: var(--bg-3);
  color: var(--ink);
  box-shadow: inset 0 -2px 0 var(--primary);
}
```

i18n keys у `apps/client/public/locales/{en,uk}/common.json`:

```json
{
  "theme": { "label": "Theme", "dark": "Dark", "light": "Light" }
}
```

```json
{
  "theme": { "label": "Тема", "dark": "Темна", "light": "Світла" }
}
```

### 2.3 — НОВИЙ `apps/client/src/components/ui/PingMeter.tsx`

```tsx
import styles from './PingMeter.module.css';

export interface PingMeterProps {
  /** Round-trip time у мілісекундах. */
  rtt: number;
}

export default function PingMeter({ rtt }: PingMeterProps) {
  const lvl = rtt < 50 ? 4 : rtt < 150 ? 3 : rtt < 300 ? 2 : 1;
  return (
    <div className={styles.ping} aria-label={`Ping ${rtt} ms`}>
      <div className={styles.bars} aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} data-on={i <= lvl} />
        ))}
      </div>
      <span>{rtt} ms</span>
    </div>
  );
}
```

**`PingMeter.module.css`:**

```css
.ping {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-mute);
}
.bars { display: flex; gap: 2px; align-items: flex-end; }
.bars span {
  width: 3px;
  background: var(--primary);
  border-radius: 1px;
  opacity: 0.3;
}
.bars span[data-on="true"]:nth-child(1) { height: 5px; opacity: 1; }
.bars span[data-on="true"]:nth-child(2) { height: 8px; opacity: 1; }
.bars span[data-on="true"]:nth-child(3) { height: 11px; opacity: 1; }
.bars span[data-on="true"]:nth-child(4) { height: 14px; opacity: 1; }
.bars span:nth-child(1) { height: 5px; }
.bars span:nth-child(2) { height: 8px; }
.bars span:nth-child(3) { height: 11px; }
.bars span:nth-child(4) { height: 14px; }
```

### 2.4 — `useWebRTCStats` hook (новий або extend існуючого)

```ts
// apps/client/src/hooks/useWebRTCStats.ts
import { useEffect, useState } from 'react';
import { usePeerConnection } from './usePeerConnection';

export function useWebRTCStats() {
  const pc = usePeerConnection();
  const [rtt, setRtt] = useState<number | null>(null);

  useEffect(() => {
    if (!pc) return;
    const id = setInterval(async () => {
      const stats = await pc.getStats();
      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          if (typeof report.currentRoundTripTime === 'number') {
            setRtt(Math.round(report.currentRoundTripTime * 1000));
          }
        }
      });
    }, 2000);
    return () => clearInterval(id);
  }, [pc]);

  return { rtt };
}
```

### Тести

- `Header.test.tsx` — рендер у обох темах
- `ThemeToggle.test.tsx` — клик → localStorage update + dataset.theme update
- `PingMeter.test.tsx` — rtt=20→4 bars, rtt=200→2 bars, rtt=400→1 bar

### Acceptance

- [ ] Header виглядає 1:1 з prototype_dashboard.html у обох темах
- [ ] ThemeToggle перемикає без flash, transition 0.6s smooth
- [ ] WebRTC ping в Dashboard оновлюється кожні 2с
- [ ] StatusBadge "online" з'являється тільки якщо є інші користувачі

### Rollback

Header — окремий PR. ThemeToggle — окремий. PingMeter — feature-flag через `?ping=1` query param на час soak.

---

## Phase 3 · Dashboard primitives (1 день)

### 3.1 — `apps/client/src/components/Dashboard/RoomCard.module.css` (full replacement)

```css
.card {
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  padding: var(--space-xl);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  min-height: 200px;
  cursor: pointer;
  transition: border-color var(--transition-base),
              box-shadow var(--transition-base),
              transform var(--transition-base);
  box-shadow: var(--shadow-engrave);
  position: relative;
}
.card:hover {
  border-color: var(--line-strong);
  transform: translateY(-2px);
  box-shadow: var(--shadow-engrave), var(--shadow-cast);
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-sm);
}
.eyebrow {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
}
.accentBar {
  width: 18px;
  height: 2px;
  border-radius: 1px;
}
.system {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
  color: var(--ink-mute);
  font-weight: 500;
}
.statusActive { color: var(--primary); font-weight: 600; }
.statusDormant { color: var(--ink-faint); }

.menuBtn {
  background: transparent;
  border: 0;
  color: var(--ink-faint);
  padding: 2px;
  border-radius: var(--radius-sm);
  opacity: 0;
  transition: opacity var(--transition-base), color var(--transition-base);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.card:hover .menuBtn,
.menuBtn:focus-visible { opacity: 1; }
.menuBtn:hover { color: var(--ink); }
.menuBtn svg { width: 16px; height: 16px; }

.name {
  font-family: var(--font-serif);
  font-weight: 500;
  font-size: var(--text-xl);
  line-height: 1.1;
  letter-spacing: -0.005em;
  color: var(--ink);
}
.name em { font-style: italic; font-weight: 500; }

.desc {
  font-size: var(--text-sm);
  color: var(--ink-mute);
  line-height: 1.5;
  flex: 1;
}

.foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
  gap: var(--space-sm);
}

.members { display: flex; align-items: center; }
.av {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--bg-3);
  border: 1.5px solid var(--bg-2);
  display: grid;
  place-items: center;
  font-size: 10px;
  font-weight: 600;
  color: var(--primary);
  font-family: var(--font-mono);
  margin-left: -8px;
}
.av:first-child { margin-left: 0; }
.more {
  color: var(--ink-faint);
  font-family: var(--font-mono);
  font-size: 10px;
  margin-left: 6px;
}

.created {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-faint);
}
```

### 3.2 — `RoomCard.tsx` мінімальні правки

Структуру JSX міняти не треба — лишається такою, як є. Видалити в `eyebrowTone` логіку через `styles.eyebrowActive/eyebrowMuted` і замінити на одну з нових status-class:

```tsx
const statusClass = room.status === 'active' ? styles.statusActive : styles.statusDormant;
```

Додати accent-bar:

```tsx
<div className={styles.eyebrow}>
  <div className={styles.accentBar} style={{ background: accent }} />
  <div className={styles.system}>
    {room.gameSystem.toUpperCase()} · <span className={statusClass}>
      {t(`status.${room.status}`)}
    </span>
  </div>
</div>
```

### 3.3 — `apps/client/src/components/Dashboard/gameSystem.ts`

```ts
export const gameSystemAccent = (sys: string): string => {
  switch (sys) {
    case 'dnd':         return 'var(--rune)';        // gold (D&D brand)
    case 'pathfinder':  return '#7fb59a';            // sage green
    case 'coc':         return '#b07bc4';            // dusty purple
    case 'homebrew':
    default:            return 'var(--primary)';     // cold steel (dark) / leaf-gold (light)
  }
};
```

### 3.4 — `CreateRoomCard.module.css`

```css
.create {
  border: 1px dashed var(--line-strong);
  background: transparent;
  padding: var(--space-xl);
  display: grid;
  place-items: center;
  text-align: center;
  min-height: 200px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color var(--transition-base), background var(--transition-base);
}
.create:hover {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 4%, transparent);
}
.plus {
  font-family: var(--font-serif);
  font-style: italic;
  font-size: 48px;
  color: var(--primary);
  line-height: 1;
  margin-bottom: 6px;
}
.lbl {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--ink-mute);
  margin-top: 6px;
}
.sublbl {
  font-size: 13px;
  color: var(--ink-faint);
  margin-top: 6px;
  font-family: var(--font-serif);
  font-style: italic;
}
```

### 3.5 — Page-level Dashboard.tsx

Додати page-head згідно прототипу:

```tsx
<div className={styles.pageHead}>
  <div className="eyebrow accent">{t('dashboard.section')}</div>
  <h1 className={styles.pageTitle}>{t('dashboard.title')}</h1>
  <p className={styles.pageLede}>{t('dashboard.lede')}</p>
  <hr className="fold" />
</div>
```

`Dashboard.module.css`:

```css
.pageHead { margin-bottom: var(--space-2xl); }
.pageTitle {
  font-family: var(--font-serif);
  font-weight: 500;
  font-size: var(--text-3xl);
  line-height: 1;
  letter-spacing: -0.005em;
  margin-bottom: var(--space-xs);
  color: var(--ink);
}
.pageTitle em { font-style: italic; font-weight: 500; }
.pageLede {
  font-family: var(--font-serif);
  font-style: italic;
  font-size: var(--text-lg);
  color: var(--ink-mute);
  max-width: 640px;
  margin-bottom: var(--space-lg);
}
```

i18n:
```json
{ "dashboard": {
  "section": "Майстерська · Кампанії",
  "title": "Ваші <em>кімнати</em>",
  "lede": "Кожна кімната — окрема кампанія. Створюйте, керуйте, входьте як майстер чи гравець."
} }
```

(використати `<Trans>` для рендеру `<em>`).

### Тести

- Snapshot RoomCard для всіх 4-х game systems і 2-х статусів
- E2E: відкрити Dashboard → побачити 5+ карток → клікнути → перейти на GameRoom
- Visual regression: порівняти Dashboard з `prototype_dashboard.html`

### Acceptance

- [ ] Dashboard візуально збігається з прототипом
- [ ] Всі 4 game system accent-кольори правильні
- [ ] Status active/dormant читається без додаткової інформації
- [ ] Hover-state hint на translate-Y та shadow

### Rollback

`RoomCard.module.css` старий зберегти як `.legacy.css`. Switch — через feature-flag у `tokens.css`.

---

## Phase 4 · GameRoom primitives (1–2 дні)

### 4.1 — InitiativeToken (ember rule)

`apps/client/src/components/InitiativeBar/InitiativeToken.module.css`:

```css
.token {
  width: 42px;
  height: 42px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  position: relative;
  cursor: pointer;
  transition: all var(--transition-base);
  background-image: linear-gradient(140deg, var(--bg-2), var(--bg-1));
}
.token.active {
  border-color: var(--ember);
  box-shadow: 0 0 0 1px var(--ember),
              0 0 18px -2px color-mix(in srgb, var(--ember) 55%, transparent);
}
.token.active::after {
  content: '';
  position: absolute;
  top: -3px;
  right: -3px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ember);
  box-shadow: 0 0 8px var(--ember);
}
```

`InitiativeToken.tsx` — додати `data-active={isActiveTurn}` і прокинути до `className`:

```tsx
className={clsx(styles.token, isActiveTurn && styles.active)}
```

### 4.2 — НОВИЙ `apps/client/src/components/CharacterSheet/HPBar.tsx`

```tsx
import { useEffect, useState } from 'react';
import styles from './HPBar.module.css';

export interface HPBarProps {
  current: number;
  max: number;
  /** Скільки HP щойно вирвано (показується як wound 3s після події) */
  recentDamage?: number;
}

export default function HPBar({ current, max, recentDamage = 0 }: HPBarProps) {
  const [showWound, setShowWound] = useState(recentDamage > 0);

  useEffect(() => {
    if (recentDamage <= 0) { setShowWound(false); return; }
    setShowWound(true);
    const id = setTimeout(() => setShowWound(false), 3000);
    return () => clearTimeout(id);
  }, [recentDamage]);

  const fullPct = Math.max(0, (current / max) * 100);
  const woundPct = showWound ? Math.min(100 - fullPct, (recentDamage / max) * 100) : 0;

  return (
    <div className={styles.bar} role="meter" aria-valuenow={current} aria-valuemin={0} aria-valuemax={max} aria-label={`HP ${current} of ${max}`}>
      <div className={styles.full} style={{ width: `${fullPct}%` }} />
      {showWound && <div className={styles.wound} style={{ width: `${woundPct}%` }} />}
      <div className={styles.empty} />
    </div>
  );
}
```

**`HPBar.module.css`:**

```css
.bar {
  display: flex;
  height: 8px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--line);
  background: var(--bg-0);
  box-shadow: var(--shadow-engrave);
}
.bar > div { height: 100%; transition: width 600ms cubic-bezier(.2,.7,.2,1); }
.full {
  background: linear-gradient(180deg, var(--vitality-hi), var(--vitality));
}
.wound {
  background: linear-gradient(180deg, var(--blood-hi), var(--blood));
  box-shadow: 0 0 8px -1px color-mix(in srgb, var(--blood-hi) 50%, transparent);
}
.empty { flex: 1; }
```

### 4.3 — Інтеграція HPBar у CharacterSheet

```tsx
const { hp, maxHp, recentDamage } = useCharacterHP(character.id);
<HPBar current={hp} max={maxHp} recentDamage={recentDamage} />
```

`useCharacterHP` — окремий hook, читає `combat.hp` зі store, тримає `recentDamage` через diff попередньої та поточної value на 3s.

### Тести

- Unit: HPBar з різними current/max/recentDamage
- Visual: знизити HP з 24→8 → wound з'явиться на 3s, потім зникне
- Initiative: turn change → ember "переливається"

### Acceptance

- [ ] InitiativeBar активний хід чітко відрізняється (ember) від решти (нейтральний)
- [ ] HP bar три сегменти, wound зникає через 3s
- [ ] Жодних red fills на destructive buttons (audit grep)
- [ ] WCAG: HP bar `role="meter"` + `aria-valuenow/min/max`

### Rollback

HPBar — новий компонент, старий cells-варіант лишається доступним за feature flag `ENABLE_HP_BAR_V2`.

---

## Phase 5 · Atmospheric layer (півдня)

### 5.0 — Topographic background (NEW — algorithmic)

**Алгоритм:** [`_design_preview/gen_topo_bg.py`](gen_topo_bg.py) — fractal value noise (4 octaves) + Marching Squares (Lorensen-Cline 1987). Output → 2 статичні SVG-файли:
- `bg_topo_dark.svg` (~900 KB pre-gzip, fallen-gold #c8a55c contours, viewBox 1920×1080)
- `bg_topo_light.svg` (~900 KB pre-gzip, leaf-gold #a87a14 contours, viewBox 1920×1080)

**Кроки:**

1. Скопіювати у `apps/client/public/textures/`:
   ```
   bg_topo_dark.svg
   bg_topo_light.svg
   gen_topo_bg.py    # source of truth — для регенерації при зміні палітри
   ```

2. **Cleanup перед deploy:** видалити `<rect width=... fill="..."/>` з кожного SVG (рядок 239 в `gen_topo_bg.py`, опція `bg_color`). Без bg-rect SVG прозорий — не залежить від blend-mode для коректності, контури рендеряться поверх body's bg-color.

3. У `tokens.css` додати у обидва теми:
   ```css
   :root {
     /* topo */
     --topo-bg: url('/textures/bg_topo_light.svg');
     --topo-opacity: 0.55;
     --topo-blend: multiply;
   }
   [data-theme="dark"] {
     --topo-bg: url('/textures/bg_topo_dark.svg');
     --topo-opacity: 0.90;
     --topo-blend: screen;
   }
   ```

4. У `global.css` додати **третій** atmospheric layer перед grain (`body::after`):
   ```css
   body::after {
     content: '';
     position: fixed;
     inset: 0;
     pointer-events: none;
     z-index: var(--z-background);
     background-image: var(--topo-bg);
     background-size: cover;
     background-position: center;
     opacity: var(--topo-opacity);
     mix-blend-mode: var(--topo-blend);
     transition: opacity var(--transition-slow);
   }
   ```
   `body::before` (grain) і `body::after` (topo) дають незалежні шари — z-index однаковий (`-1`), порядок stacking за специфікацією: `::before` під `::after`. Якщо хочеш topo ПІД grain — поміняй місцями.

5. **Performance:** обидва SVG разом ~1.8 MB pre-gzip → ~300-400 KB після gzip (Vercel/Render автоматично). Lazy-loaded як background-image, не блокує LCP. На мобільному CPU GZIP-decode ~50 ms одноразово.

6. **Опційно — зменшити розмір:** в `gen_topo_bg.py` змінити `GRID_W, GRID_H = 160, 120` (з 240×180) → файли стають ~350 KB. Для дисертації не критично, для prod — варто розглянути.

### 5.1 — Винятки для Konva canvas

`body::before` має `pointer-events: none`, але візуально може накладатися на canvas. Якщо так — обмежити paper layer:

```css
body[data-page="gameroom"]::before { display: none; }
```

Додати у `GameRoom.tsx` ефект:

```tsx
useEffect(() => {
  document.body.dataset.page = 'gameroom';
  return () => { delete document.body.dataset.page; };
}, []);
```

### 5.2 — Performance аудит

```bash
# Lighthouse у Dashboard
npx lighthouse http://localhost:5173/dashboard --view --preset=desktop
npx lighthouse http://localhost:5173/dashboard --view --preset=mobile

# CPU profile у Chrome DevTools
# Перевірити: layout shift < 0.1, paint < 16ms на кожному кадрі при scroll
```

Якщо просідає на mobile — перевести paper layer у `prefers-reduced-motion: reduce` opt-out:

```css
@media (prefers-reduced-motion: reduce) {
  body { background-image: none; background: var(--bg-0); }
  body::before { display: none; }
}
```

### Acceptance

- [ ] Lighthouse Performance ≥ 85 (desktop) / 70 (mobile)
- [ ] CLS < 0.1
- [ ] GameRoom canvas без paper-overlay (dev tools перевірка)

---

## Phase 6 · Polish (півдня)

### 6.1 — `apps/client/src/components/ui/StatusBadge.tsx` (НОВИЙ)

```tsx
import { type ReactNode } from 'react';
import clsx from 'clsx';
import styles from './StatusBadge.module.css';

export type BadgeTone = 'neutral' | 'live' | 'danger';

interface StatusBadgeProps {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
}

export default function StatusBadge({ tone = 'neutral', dot = true, children }: StatusBadgeProps) {
  return (
    <div className={clsx(styles.badge, styles[tone])}>
      {dot && <span className={styles.dot} />}
      {children}
    </div>
  );
}
```

**`StatusBadge.module.css`:**

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  border: 1px solid var(--line);
  background: var(--bg-1);
  color: var(--ink-mute);
  box-shadow: var(--shadow-engrave);
}
.dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
.live { color: var(--primary); border-color: var(--primary); }
.live .dot { background: var(--primary); box-shadow: 0 0 6px var(--primary); }
.danger {
  color: var(--blood-hi);
  border-color: var(--blood-hi);
  background: color-mix(in srgb, var(--blood) 15%, transparent);
}
.danger .dot { background: var(--blood-hi); box-shadow: 0 0 6px var(--blood-hi); }
```

### 6.2 — Замінити hard-coded badges по проекту

```bash
grep -rn "pill-badge\|status-pill\|<Badge" apps/client/src --include="*.tsx"
```

Кожне використання → замінити на `<StatusBadge tone="live|danger|neutral" />`.

### 6.3 — Sepia divider у Landing

```tsx
// LandingPage.tsx
<section>
  <h2>{t('landing.feature1.title')}</h2>
  <hr className="fold" />
  <p>{t('landing.feature1.desc')}</p>
</section>
```

### 6.4 — ChatPanel + AIPanel перевірка

Audit:
- AssistantPanel input → engraved style з Input компонента
- ChatPanel messages → Cormorant для GM "narration", Inter для player text
- Mode toggle (Talk/Roll/Whisper) → ThemeToggle pattern

### Acceptance

- [ ] Жодного hard-coded badge у тілі коду — всі через `<StatusBadge>`
- [ ] Landing виглядає атмосферно з sepia-divider
- [ ] AssistantPanel + ChatPanel у новій типографіці

---

## Phase 7 · Bible sync + screenshots (півдня)

### 7.1 — `PROJECT_BIBLE.md` § 3.6 patch

Додати після поточного блоку про токени один новий абзац:

> **Sync 2026-05-XX (hybrid design):** палітра переоформлена з нейтральної fantasy на двотемну систему **Obscure (dark) + Sacred Order (light)**. Референси: Bloodborne / Berserk / Dark Souls / Witcher / Elden Ring (dark) і illuminated manuscript / cathedral dawn (light). Primary в dark — `--steel #9eaab8` (cold pewter, не gold), у light — `--rune #a87a14` (leaf-gold). Введено правила: **wound rule** (`--blood-hi` ніколи не на кнопці, лише на HP/wound), **ember-on-active-hour** (`--ember` тільки на активному ході в Initiative). Display-шрифт — Cormorant Garamond 500 (замість Inter Bold). Sigil — dual SVG (Oracle / Counselor) з theme-conditional рендером, оригінал — `_design_preview/quick_wins_hybrid.html`. Source of truth: `_design_preview/`.

### 7.2 — Скріншоти для §3.6 розділу дисертації

Зробити (Chrome 1440×900, dark + light для кожного):
1. `auth_dark.png`, `auth_light.png`
2. `dashboard_dark.png`, `dashboard_light.png`
3. `gameroom_dark.png`, `gameroom_light.png`
4. `assistant_dark.png`, `assistant_light.png`

Додати у `04_Розділ_3/_output/images/` з підписами + WCAG-звіт у таблиці контрастів.

### 7.3 — Optional: design system як додаток

Конвертувати `quick_wins_hybrid.html` у PDF (Chrome → Print → Save as PDF, 1280px width). Додати у додатки дисертації як "Додаток В — Дизайн-система Obscure VTT".

### Verified

> Logic ✓ (тільки CSS + 1 новий компонент HPBar + 1 PingMeter + 1 StatusBadge), Academic Style ✓, Bible Sync ✓ (§3.6 patch у Phase 7).

---

## Cross-cutting concerns

### a11y checklist

- [ ] WCAG AA контрасти у обох темах:
  - `--ink` на `--bg-0` ≥ 4.5:1
  - `--ink-mute` на `--bg-0` ≥ 4.5:1
  - `--primary` на `--bg-0` ≥ 3:1 (large/bold text)
- [ ] Focus-visible outlines всюди (button, input, link)
- [ ] InitiativeBar `aria-current="time"` на активному ході
- [ ] HPBar `role="meter"` + aria
- [ ] ThemeToggle `role="radiogroup"` + `aria-checked`
- [ ] Sigil SVG `aria-hidden="true"` (декоративний)
- [ ] StatusBadge — текст самодостатній (не лише колір)

### Performance budgets

- bundle JS gzipped: < 250 kB (без зміни — лише CSS)
- bundle CSS gzipped: < 35 kB
- LCP < 2.5s
- CLS < 0.1
- INP < 200ms

### i18n

Усі нові рядки додати у обидві локалі `apps/client/public/locales/{en,uk}/common.json` одночасно. Patch для:
- `theme.dark`, `theme.light`
- `dashboard.section`, `dashboard.title`, `dashboard.lede`
- `room.status.active`, `room.status.dormant`
- `landing.*` (sepia divider секції)
- `gameroom.initiative.activeTurn` (announce)

### Testing matrix

| Browser | Theme | Critical paths |
|---|---|---|
| Chrome 120+ | dark/light | Auth → Dashboard → GameRoom |
| Firefox 120+ | dark/light | Same |
| Safari 17+ | dark/light | Same (особливо `backdrop-filter`, `color-mix`) |
| Edge 120+ | dark/light | Same |
| Mobile Safari iOS 17 | dark/light | Auth + Dashboard (GameRoom desktop-only) |

### Migration order recommendation

```
PR-1 (Phase 0) → tokens + globals + favicon              [merge first]
PR-2 (Phase 1) → Logo + Button + Input                    [parallel-safe з PR-3]
PR-3 (Phase 2) → Header + ThemeToggle + PingMeter         [parallel-safe з PR-2]
PR-4 (Phase 3) → Dashboard primitives                     [після PR-1, PR-2]
PR-5 (Phase 4) → InitiativeBar + HPBar                    [після PR-1]
PR-6 (Phase 5) → Atmospheric layer                        [після PR-1]
PR-7 (Phase 6) → StatusBadge + Landing divider + polish   [після всіх]
PR-8 (Phase 7) → Bible patch + screenshots                [last]
```

PR-2 і PR-3 паралельні — можна mergити в довільному порядку.

---

## Hard-coded color audit (final list)

Перед стартом Phase 0 запустити та задокументувати усі знахідки:

```bash
grep -rnE "#[0-9a-fA-F]{6}\b" apps/client/src \
  --include="*.css" --include="*.module.css" --include="*.tsx" \
  --exclude-dir=node_modules \
  | grep -vE "tokens\.css:" \
  | tee _design_preview/audit_hardcoded_hex.txt
```

Вивід зберегти у `_design_preview/audit_hardcoded_hex.txt`. Кожен рядок:
- замінити на `var(--token)` АБО
- зафіксувати у backlog як "design legacy debt".

---

## Acceptance criteria (фінальні)

- [ ] Усі сторінки клієнта без єдиного hard-coded hex окрім токенів у `tokens.css`
- [ ] Lighthouse a11y ≥ 95 в обох темах на Auth/Dashboard/GameRoom
- [ ] WCAG AA для всіх text-on-background пар
- [ ] Theme toggle працює без flash (logic у `index.html` працює як зараз)
- [ ] Dashboard / GameRoom / Auth візуально збігаються з `prototype_dashboard.html` та відповідними секціями `quick_wins_hybrid.html`
- [ ] Favicon у tab браузера = `favicon.svg` (Obscure variant)
- [ ] `theme-color` meta = `#0a0c10`
- [ ] Bible §3.6 містить sync-абзац
- [ ] Жодного нового runtime-залежного шрифту чи зображення (CSS-only + 1 SVG favicon)
- [ ] Performance budgets viable (CLS<0.1, LCP<2.5s)
- [ ] Існуючі E2E/unit тести проходять
- [ ] Усі 8 PR помержено у `main`

---

## Open questions

1. **Назва бренду** — "Obscure VTT" фінальна? Якщо ні — sigil лишається, лише text-mark міняється у `Logo.tsx`.
2. **GameRoom + paper layer** — чи дозволяти користувачу `prefers-reduced-motion` як кнопку у settings?
3. **Mobile responsive** — sigil 40px у header може ущільнитися на 320px ширині. Згорнути brand-meta під `@media (max-width: 480px)`?
4. **Sound design** — концепт не чіпав audio. Окрема ітерація.
5. **GameSystem accent палітра** — чи додати ще: Vampire (рожевий), Cyberpunk (неон-блакитний)? Зараз 4 варіанти.
6. **Анімації sigil** — оригінал має `spin-cw-24/32` повільні обертання. У прототипі прибрав для performance — повертати чи ні? Можна тільки у Hero (Auth/Landing 180px), не у Header (40px).

---

## Estimated timeline (1 розробник)

```
День 1 → Phase 0 (foundations)               [PR-1]
День 2 → Phase 1 (atomics)                    [PR-2]
День 3 → Phase 2 (layout)                     [PR-3]
День 4 → Phase 3 (dashboard)                  [PR-4]
День 5 → Phase 4 (gameroom + initiative)      [PR-5]
День 6 → Phase 5 + Phase 6 (atmo + polish)    [PR-6, PR-7]
День 7 → Phase 7 + bug-fixes + screenshots    [PR-8]
День 8 → soak / bug-bash / final QA
```

**Buffer:** +1 день на непередбачувані візуальні регресії у нечасто-використовуваних компонентах (CharacterSheet, AudioPanel, AssetPicker).

---

*Згенеровано на базі `_design_preview/quick_wins_hybrid.html` v2 + `prototype_dashboard.html` v3, 2026-05-03.*
