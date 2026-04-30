/**
 * Game-room sidebar shell. Three slots reserved per the GM mockup
 * (рис. 2.12, §2.10): Initiative tracker (Ф7.3), Character roster (Ф9), and
 * the Assistant panel button (Ф8). Slot bodies are populated by Chat 7.1
 * (Initiative + Characters) and a future AI Assistant chat (Ф8).
 */
export default function Sidebar(): JSX.Element {
  return (
    <aside className="sidebar" aria-label="Room sidebar">
      <section className="sidebar__slot" data-slot="initiative" aria-label="Initiative tracker">
        <h3>Ініціатива</h3>
        <p className="sidebar__placeholder">Наповнюється у Чаті 7.1 (Ф7.3).</p>
      </section>
      <section className="sidebar__slot" data-slot="characters" aria-label="Character roster">
        <h3>Персонажі</h3>
        <p className="sidebar__placeholder">Наповнюється у Чаті 7.1 (Ф9).</p>
      </section>
      <section className="sidebar__slot" data-slot="assistant" aria-label="AI assistant">
        <h3>AI-помічник</h3>
        <button
          type="button"
          disabled
          title="Чат 8 — AI Assistant"
          className="sidebar__assistant-btn"
        >
          🤖 Відкрити
        </button>
      </section>
    </aside>
  );
}
