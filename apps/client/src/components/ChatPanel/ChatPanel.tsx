import { useState, type FormEvent } from 'react';
import type { ChatMode } from '@vtt/shared';
import { useAppSelector } from '../../store';
import { emitChatMessage } from '../../api/socket';

interface ChatPanelProps {
  roomId: string;
}

const MODES: { value: ChatMode; label: string }[] = [
  { value: 'ic', label: 'У ролі (IC)' },
  { value: 'ooc', label: 'Поза роллю (OOC)' },
  { value: 'whisper', label: 'Шепіт' },
];

/**
 * Chat with mode selector (IC / OOC / whisper). Whisper requires a recipientId
 * — entered as the userId of another room member. Dice rolls share the
 * messages list (rendered with their rollPayload).
 */
export default function ChatPanel({ roomId }: ChatPanelProps): JSX.Element {
  const messages = useAppSelector((s) => s.chat.messages);
  const members = useAppSelector((s) => s.room.members);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<ChatMode>('ic');
  const [recipientId, setRecipientId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!text.trim()) return;
    setError(null);
    try {
      await emitChatMessage({
        roomId,
        text,
        mode,
        ...(mode === 'whisper' && recipientId ? { recipientId } : {}),
      });
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    }
  }

  return (
    <section className="chat-panel" aria-label="Chat panel">
      <ul className="chat-panel__messages">
        {messages.map((m) => (
          <li key={m.id} className={`chat-panel__msg chat-panel__msg--${m.mode}`}>
            <span className="chat-panel__author">{m.userId.slice(0, 6)}</span>
            <span className="chat-panel__mode">[{m.mode}]</span>
            {m.rollPayload ? (
              <span className="chat-panel__roll">
                {m.rollPayload.expression} = <strong>{m.rollPayload.total}</strong>{' '}
                ({m.rollPayload.rolls.join(', ')})
              </span>
            ) : (
              <span className="chat-panel__text">{m.text}</span>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={onSubmit} className="chat-panel__form">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as ChatMode)}
          aria-label="Chat mode"
        >
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        {mode === 'whisper' && (
          <select
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value)}
            aria-label="Whisper recipient"
            required
          >
            <option value="">— оберіть отримувача —</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>{m.name}</option>
            ))}
          </select>
        )}
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Повідомлення…"
          aria-label="Chat message input"
        />
        <button type="submit">Надіслати</button>
      </form>
      {error && <p className="chat-panel__error">{error}</p>}
    </section>
  );
}
