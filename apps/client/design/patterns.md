# UI Patterns — VTT Platform

Мапінг патернів §2.10.3 на React-компоненти та файли. Джерело для §3.9 диплома.

---

| # | Pattern (з табл. 2.3) | React component | Файл | Примітка |
|---|---|---|---|---|
| 1 | Role-Based View Composition | `App` (root switch) | [src/App.tsx](../src/App.tsx) | `status` + `currentRoom` + `myRole` визначають, який екран рендерити |
| 2 | Master–Detail | `Dashboard` | [src/pages/Dashboard/Dashboard.tsx](../src/pages/Dashboard/Dashboard.tsx) | Список кімнат → деталі при кліку «Відкрити» |
| 3 | Dockable Side Panels | `Sidebar` | [src/components/Sidebar/Sidebar.tsx](../src/components/Sidebar/Sidebar.tsx) | Вкладки Chat / Dice / Sheets / Log; фіксована ширина 320 px |
| 4 | Slash Commands | `ChatPanel` | [src/components/ChatPanel/ChatPanel.tsx](../src/components/ChatPanel/ChatPanel.tsx) | Парсер `/roll`, `/w`, `/ooc` вбудований у submit-handler |
| 5 | Optimistic UI | `TokenLayer` | [src/components/GameCanvas/layers/TokenLayer.tsx](../src/components/GameCanvas/layers/TokenLayer.tsx) | Локальна позиція токена оновлюється до підтвердження `token:moved` |
| 6 | Progressive Disclosure | `SceneManager`, `AssistantPanel` | [src/components/SceneManager/SceneManager.tsx](../src/components/SceneManager/SceneManager.tsx), [src/components/AssistantPanel/AssistantPanel.tsx](../src/components/AssistantPanel/AssistantPanel.tsx) | GM-інструменти та панель AI сховані за вкладкою / кнопкою |
| 7 | Modal Confirmation | `TokenEditModal`, `CreateSceneModal` | [src/components/Token/TokenEditModal.tsx](../src/components/Token/TokenEditModal.tsx), [src/components/SceneManager/CreateSceneModal.tsx](../src/components/SceneManager/CreateSceneModal.tsx) | Оверлей + діалог; закривається Escape та кліком поза зоною |
| 8 | Skeleton Loader | `RoomLobby` | [src/pages/RoomLobby/RoomLobby.tsx](../src/pages/RoomLobby/RoomLobby.tsx) | Показує плейсхолдери до ініціалізації WSS |
| 9 | Empty State | `Dashboard` | [src/pages/Dashboard/Dashboard.tsx](../src/pages/Dashboard/Dashboard.tsx) | `ownRooms.length === 0 && status === 'loaded'` → повідомлення + CTA |
| 10 | Toast Notifications | `Sidebar` (inline) | [src/components/Sidebar/Sidebar.tsx](../src/components/Sidebar/Sidebar.tsx) | WSS-події `scene:changed`, `handout:granted` → системне повідомлення |
| 11 | Drag-and-Drop | `TokenLayer`, `InitiativeTracker` | [src/components/GameCanvas/layers/TokenLayer.tsx](../src/components/GameCanvas/layers/TokenLayer.tsx), [src/components/Sidebar/InitiativeTracker.tsx](../src/components/Sidebar/InitiativeTracker.tsx) | Konva drag для токенів; dnd-kit для трекера ініціативи |
| 12 | Inline Editing | `SceneManager` | [src/components/SceneManager/SceneManager.tsx](../src/components/SceneManager/SceneManager.tsx) | Подвійний клік на назву сцени → `<input>` на місці |
| 13 | Dual-Theme Toggle (runtime) | `ThemeToggle` | [src/components/Header/ThemeToggle.tsx](../src/components/Header/ThemeToggle.tsx) | Segmented control: ☀️ Light / 🌙 Dark / 💻 System; зберігає вибір у `localStorage('preferences')`; `system` слідує `prefers-color-scheme` через matchMedia-listener |

---

## Архітектурний ланцюг теми

```
preferences.theme ('light' | 'dark' | 'system')
    ↓ useTheme()
resolved: 'light' | 'dark'
    ↓ useEffect
document.documentElement.dataset.theme = resolved
    ↓ CSS cascade
[data-theme="dark"] { --color-bg: #0f172a; ... }
```

Реалізація:
- Store slice: [src/store/preferences.ts](../src/store/preferences.ts)
- Hook: [src/hooks/useTheme.ts](../src/hooks/useTheme.ts)
- Konva integration: [src/components/GameCanvas/GameCanvas.tsx](../src/components/GameCanvas/GameCanvas.tsx) — `Stage` `backgroundColor` + `FogOfWarLayer` `fowAlpha`
