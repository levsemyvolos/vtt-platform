# Допоміжні UI-бібліотеки клієнта (поза основним стеком табл. 2.17 Bible)

Ці залежності додано у Чаті 7.1 для покриття вимог Ф7 (initiative tracker
з drag-to-reorder для GM) та Ф9 (нотатки GM з рендерингом Markdown). Вони
використовуються лише в UI-шарі апаратів кампанії й не впливають на
реалтайм-канал, OCC чи RBAC, тому не змінюють архітектурний стек з §2.17
PROJECT_BIBLE.

| Пакет | Призначення | Місце використання |
|-------|-------------|--------------------|
| `@dnd-kit/core` | DnD-движок (DndContext, sensors) | `Sidebar/InitiativeTracker.tsx` — GM перетягує учасників ініціативи |
| `@dnd-kit/sortable` | Sortable-стратегія + `useSortable` hook | той самий компонент — обчислює `orderedIds[]` для `POST /scenes/:id/initiative/reorder` |
| `react-markdown` | Безпечний рендер Markdown у React | `Notes/NotesPanel.tsx` — preview панелі редактора нотаток GM |

Будуть зафіксовані у §3.6 (опис компонентів) та §3.8 (тестування) дипломної
роботи. Підстава вибору — мінімальний bundle-footprint і нульова залежність
від глобального стану (sortable працює через локальні refs).
