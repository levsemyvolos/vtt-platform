# Component Catalog — VTT Platform

Каталог компонентів для §3.1, §3.6 диплома. Кожна комірка «Стан» описує поведінку у light темі; dark-еквівалент — через CSS custom properties (без зміни HTML).

---

## Button

**Файл:** `src/components/common/Button` *(запланований 7.10c)*  
**Поточні вживання:** inline `<button>` у Dashboard, Auth, ChatPanel тощо.

| Variant | Default | Hover | Active | Disabled |
|---|---|---|---|---|
| `primary` | bg `--color-primary`, text `--color-text-inverse` | bg `--color-primary-hover` | bg `--color-primary-active` | opacity 0.5, cursor not-allowed |
| `secondary` | bg `--color-surface`, border `--color-border`, text `--color-text-primary` | bg `--color-surface-hover` | bg `--color-surface-hover`, border `--color-border-strong` | opacity 0.5 |
| `danger` | bg `--color-danger`, text `--color-text-inverse` | bg `--color-danger-hover` | bg `--color-danger-hover` | opacity 0.5 |
| `ghost` | bg transparent, text `--color-primary` | bg `--color-primary-muted` | bg `--color-primary-muted` | opacity 0.5 |

Sizes: `sm` (height 32px, `--text-sm`), `md` (height 40px, `--text-base`), `lg` (height 48px, `--text-lg`).

---

## Input

**Файл:** `src/components/common/Input` *(запланований 7.10c)*  
**Поточні вживання:** `<input>` у Login, Register, Dashboard create-room form.

| State | Light | Dark |
|---|---|---|
| Default | border `--color-border`, bg `--color-surface`, text `--color-text-primary` | border `--color-border`, bg `--color-surface`, text `--color-text-primary` |
| Focus | border `--color-primary`, outline `--color-primary` 2px offset 1px | border `--color-primary`, outline `--color-primary` 2px |
| Error | border `--color-danger`, bg `--color-danger-bg` | border `--color-danger`, bg `--color-danger-bg` |
| Disabled | bg `--color-surface-hover`, text `--color-text-muted` | bg `--color-surface-hover`, text `--color-text-muted` |

---

## Select

**Файл:** `src/components/common/Select` *(запланований 7.10c)*  
**Поточні вживання:** `<select>` у CharacterSheet, AudioPanel.

Same state tokens as Input. Native select + custom chevron-icon overlay.

---

## Textarea

**Файл:** `src/components/common/Textarea` *(запланований 7.10c)*  
**Поточні вживання:** Notes panel, CharacterSheet notes field.

Same state tokens as Input. `resize: vertical`, `min-height: 80px`.

---

## Modal

**Файл:** `src/components/common/Modal` *(запланований 7.10c)*  
**Поточні вживання:** TokenEditModal, CreateSceneModal, GenerateBackgroundModal.

| Element | Token |
|---|---|
| Overlay | bg `--color-overlay`, z-index `--z-modal` |
| Dialog box | bg `--color-surface`, border-radius `--radius-lg`, shadow `--shadow-lg` |
| Header | border-bottom `--color-border`, text `--text-lg` bold |
| Close button | ghost variant, icon `×` |

---

## Toast

**Файл:** `src/components/common/Toast` *(запланований 7.10c)*  
**Поточні вживання:** відсутні (toast логіка inline у Sidebar).

| Variant | Icon color | bg |
|---|---|---|
| `success` | `--color-success` | `--color-success-bg` |
| `warning` | `--color-warning` | `--color-warning-bg` |
| `danger` | `--color-danger` | `--color-danger-bg` |
| `info` | `--color-info` | `--color-info-bg` |

Z-index: `--z-toast`. Border-radius: `--radius-md`. Shadow: `--shadow-md`.

---

## Tooltip

**Файл:** `src/components/common/Tooltip` *(запланований 7.10c)*  
**Поточні вживання:** AnnotationToolbar кнопки (title attribute).

bg `--color-text-primary`, text `--color-text-inverse`, `--text-xs`, `--radius-sm`, `--shadow-sm`. Z-index `--z-elevated`.

---

## Card

**Файл:** `src/components/common/Card` *(запланований 7.10c)*  
**Поточні вживання:** `.room-card` у Dashboard.

| State | Token |
|---|---|
| Default | bg `--color-surface`, border `--color-border`, radius `--radius-md`, shadow `--shadow-sm` |
| Hover | shadow `--shadow-md`, border `--color-border-strong` |
| Selected | border `--color-primary` 2px, bg `--color-primary-muted` |

---

## Panel

**Файл:** `src/components/common/Panel` *(запланований 7.10c)*  
**Поточні вживання:** Sidebar, AssistantPanel, HandoutPanel.

bg `--color-surface`, border-right/left `--color-border`, shadow `--shadow-lg`. Width: fixed via layout (не через token).

---

## Sidebar

**Файл:** [src/components/Sidebar/Sidebar.tsx](../src/components/Sidebar/Sidebar.tsx)

| Element | Token |
|---|---|
| Container | bg `--color-surface`, border-left `--color-border`, width `320px` |
| Tab bar | bg `--color-surface-elevated`, border-bottom `--color-border` |
| Active tab | border-bottom `--color-primary` 2px, text `--color-primary` |
| Content area | padding `--space-lg`, overflow-y auto |

---

## Header / ThemeToggle

**Файл:** [src/components/Header/ThemeToggle.tsx](../src/components/Header/ThemeToggle.tsx)

Segmented control із трьох кнопок (☀️ Light / 🌙 Dark / 💻 System).

| State | Token |
|---|---|
| Inactive btn | bg `--color-surface`, text `--color-text-secondary`, border `--color-border` |
| Active btn | bg `--color-primary-muted`, text `--color-primary`, border `--color-primary` |
| Hover | bg `--color-surface-hover` |

---

## ChatPanel

**Файл:** [src/components/ChatPanel/ChatPanel.tsx](../src/components/ChatPanel/ChatPanel.tsx)

| Element | Token |
|---|---|
| Container | bg `--color-surface`, border `--color-border` |
| Message bubble (self) | bg `--color-primary-muted`, radius `--radius-md` |
| Message bubble (other) | bg `--color-surface-hover`, radius `--radius-md` |
| Input area | border-top `--color-border`, bg `--color-surface` |
| Slash-command hint | text `--color-text-muted`, `--text-xs` |

---

## DiceRoller

**Файл:** [src/components/DiceRoller/DiceRoller.tsx](../src/components/DiceRoller/DiceRoller.tsx)

bg `--color-surface`, border `--color-border`, radius `--radius-md`. Result display: `--text-lg` bold, `--color-primary`.

---

## InitiativeTracker

**Файл:** [src/components/Sidebar/InitiativeTracker.tsx](../src/components/Sidebar/InitiativeTracker.tsx)

| Element | Token |
|---|---|
| Row | bg `--color-surface`, border-bottom `--color-border` |
| Active row | bg `--color-primary-muted`, border-left `--color-primary` 3px |
| HP bar (full) | bg `--color-success` |
| HP bar (half) | bg `--color-warning` |
| HP bar (low) | bg `--color-danger` |

---

## VideoTile

**Файл:** [src/components/VideoTile/VideoTile.tsx](../src/components/VideoTile/VideoTile.tsx)

bg `#000`, border-radius `--radius-md`. Connection state overlay: STABLE → `--color-success`, JITTER → `--color-warning`, OFFLINE → `--color-danger`.

---

## VideoGrid

**Файл:** [src/components/VideoCall/VideoGrid.tsx](../src/components/VideoCall/VideoGrid.tsx)

CSS Grid auto-layout (2×2 / 2×3 / 3×3). Gap `--space-xs`. bg `--color-bg`. MeshCeilingBanner: bg `--color-warning-bg`, text `--color-warning`.

---

## SceneManager

**Файл:** [src/components/SceneManager/SceneManager.tsx](../src/components/SceneManager/SceneManager.tsx)

Scene list item: bg `--color-surface`, border `--color-border`, radius `--radius-sm`. Active scene: border `--color-primary`, bg `--color-primary-muted`. Hidden scene (GM only): text `--color-text-muted`, italic.

---

## AudioPanel

**Файл:** [src/components/AudioPanel/AudioPanel.tsx](../src/components/AudioPanel/AudioPanel.tsx)

Track item: bg `--color-surface`, border-bottom `--color-border`. Playing indicator: `--color-success`. Progress bar fill: `--color-primary`.

---

## AssistantPanel

**Файл:** [src/components/AssistantPanel/AssistantPanel.tsx](../src/components/AssistantPanel/AssistantPanel.tsx)

User message: bg `--color-primary-muted`. Assistant message: bg `--color-surface-elevated`. Thinking state: text `--color-text-muted`, animated dots. Error: text `--color-danger`.

---

## AnnotationToolbar

**Файл:** [src/components/GameCanvas/AnnotationToolbar.tsx](../src/components/GameCanvas/AnnotationToolbar.tsx)

bg `--color-surface`, border `--color-border`, radius `--radius-md`, shadow `--shadow-sm`. Active tool: bg `--color-primary-muted`, text `--color-primary`.

---

## HandoutPanel

**Файл:** [src/components/Handouts/HandoutPanel.tsx](../src/components/Handouts/HandoutPanel.tsx)

Handout item: bg `--color-surface`, border `--color-border`, radius `--radius-sm`. Granted indicator: `--color-success`. Thumbnail: border `--color-border`, radius `--radius-sm`.

---

## CharacterSheet

**Файл:** [src/components/CharacterSheet/CharacterSheet.tsx](../src/components/CharacterSheet/CharacterSheet.tsx)

Section header: `--text-sm` uppercase, `--color-text-secondary`. Stat block: bg `--color-surface-elevated`, border `--color-border`, radius `--radius-sm`. HP bar uses same tokens as InitiativeTracker HP bar.
