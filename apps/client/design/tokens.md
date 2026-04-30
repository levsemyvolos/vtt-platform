# Design Tokens — VTT Platform

Джерело істини для §3.1, §3.6, §3.9 диплома.

---

## Кольори

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--color-bg` | `#fafafa` | `#0f172a` | Фон сторінки (body) |
| `--color-surface` | `#ffffff` | `#1e293b` | Картки, панелі, модалки |
| `--color-surface-elevated` | `#f8fafc` | `#263348` | Elevated surface (dropdown, tooltip) |
| `--color-surface-hover` | `#f1f5f9` | `#334155` | Hover-стан поверхні |
| `--color-border` | `#e2e8f0` | `#334155` | Межі компонентів |
| `--color-border-strong` | `#cbd5e1` | `#475569` | Акцентні межі, focus ring |
| `--color-text-primary` | `#0f172a` | `#f1f5f9` | Основний текст (AAA) |
| `--color-text-secondary` | `#475569` | `#94a3b8` | Вторинний текст (AA) |
| `--color-text-muted` | `#94a3b8` | `#64748b` | Заглушений текст, плейсхолдери |
| `--color-text-inverse` | `#ffffff` | `#0f172a` | Текст на кольоровому фоні |
| `--color-primary` | `#6366f1` | `#818cf8` | Primary actions, посилання |
| `--color-primary-hover` | `#4f46e5` | `#6366f1` | Primary hover |
| `--color-primary-active` | `#4338ca` | `#4f46e5` | Primary active/pressed |
| `--color-primary-muted` | `#e0e7ff` | `#1e1b4b` | Primary subtle background |
| `--color-secondary` | `#64748b` | `#94a3b8` | Secondary actions |
| `--color-secondary-hover` | `#475569` | `#cbd5e1` | Secondary hover |
| `--color-success` | `#16a34a` | `#4ade80` | Success state (AA) |
| `--color-success-bg` | `#f0fdf4` | `#052e16` | Success subtle background |
| `--color-warning` | `#d97706` | `#fbbf24` | Warning state (AA) |
| `--color-warning-bg` | `#fffbeb` | `#1c1400` | Warning subtle background |
| `--color-danger` | `#dc2626` | `#f87171` | Danger/error state (AA) |
| `--color-danger-hover` | `#b91c1c` | `#ef4444` | Danger hover |
| `--color-danger-bg` | `#fef2f2` | `#1a0505` | Danger subtle background |
| `--color-info` | `#2563eb` | `#60a5fa` | Info state (AA) |
| `--color-info-bg` | `#eff6ff` | `#0c1a3d` | Info subtle background |
| `--color-overlay` | `rgba(0,0,0,0.50)` | `rgba(0,0,0,0.70)` | Modal overlay backdrop |
| `--color-canvas-bg` | `#fafafa` | `#0f172a` | Konva Stage background |
| `--color-canvas-grid` | `rgba(0,0,0,0.12)` | `rgba(255,255,255,0.10)` | Canvas grid lines |
| `--color-fow-fill` | `#000000` | `#000000` | Fog of War cell fill |
| `--color-fow-alpha` | `0.70` | `0.50` | Fog of War cell opacity |

---

## Spacing

| Token | Value | Usage |
|---|---|---|
| `--space-xs` | `4px` | Micro gap між іконкою і текстом, внутрішній padding малих бейджів |
| `--space-sm` | `8px` | Padding кнопок, gap між елементами форми |
| `--space-md` | `12px` | Внутрішній padding полів вводу, gap в рядку кнопок |
| `--space-lg` | `16px` | Padding карток, відступ між секціями |
| `--space-xl` | `24px` | Padding панелей, відступ між великими блоками |
| `--space-2xl` | `32px` | Зовнішній відступ сторінок, padding Header |

---

## Font sizes

| Token | Value | Usage |
|---|---|---|
| `--text-xs` | `12px` | Бейджі, підписи, tooltip, лічильники |
| `--text-sm` | `14px` | Вторинний текст, placeholder, label |
| `--text-base` | `16px` | Основний текст, кнопки, поля вводу |
| `--text-lg` | `20px` | Заголовки секцій, назви карток |

---

## Border radius

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | `4px` | Кнопки, поля вводу, бейджі |
| `--radius-md` | `8px` | Картки, панелі, dropdown |
| `--radius-lg` | `16px` | Модальні вікна, Toast, велике вікно відео |

---

## Shadows

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | `0 1px 2px rgba(0,0,0,0.30)` | Кнопки, поля |
| `--shadow-md` | `0 4px 6px -1px rgba(0,0,0,0.10), 0 2px 4px -2px rgba(0,0,0,0.10)` | `0 4px 6px -1px rgba(0,0,0,0.50), 0 2px 4px -2px rgba(0,0,0,0.40)` | Картки, панелі |
| `--shadow-lg` | `0 10px 15px -3px rgba(0,0,0,0.10), 0 4px 6px -4px rgba(0,0,0,0.10)` | `0 10px 15px -3px rgba(0,0,0,0.60), 0 4px 6px -4px rgba(0,0,0,0.50)` | Модалки, Sidebar |

---

## Z-index scale

| Token | Value | Usage |
|---|---|---|
| `--z-background` | `-1` | Підкладка Canvas нижче DOM |
| `--z-base` | `0` | Звичайний потік |
| `--z-elevated` | `100` | Dropdown, tooltip, sticky header |
| `--z-modal` | `400` | Модальні вікна, оверлей |
| `--z-toast` | `800` | Toast-повідомлення (завжди зверху) |
