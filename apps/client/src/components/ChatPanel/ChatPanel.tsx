import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatMode } from '@vtt/shared';
import { useAppSelector } from '../../store';
import { emitChatMessage } from '../../api/socket';
import styles from './ChatPanel.module.css';

interface ChatPanelProps {
  roomId: string;
}

/**
 * Chat with mode selector (IC / OOC / whisper). Dice rolls share the
 * messages list (rendered with their rollPayload).
 */
export default function ChatPanel({ roomId }: ChatPanelProps): JSX.Element {
  const { t } = useTranslation('room');
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
        roomId, text, mode,
        ...(mode === 'whisper' && recipientId ? { recipientId } : {}),
      });
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    }
  }

  function modeClass(m: string): string {
    if (m === 'ooc') return styles.msgOoc;
    if (m === 'whisper') return styles.msgWhisper;
    return styles.msgIc;
  }

  const MODES: { value: ChatMode; label: string }[] = [
    { value: 'ic', label: t('chat.modes.ic') },
    { value: 'ooc', label: t('chat.modes.ooc') },
    { value: 'whisper', label: t('chat.modes.whisper') },
  ];

  return (
    <section className={styles.panel} aria-label={t('chat.panelLabel')}>
      <ul className={styles.messages}>
        {messages.map((m) => (
          <li key={m.id} className={`${styles.msg} ${modeClass(m.mode)}`}>
            <span className={styles.author}>{m.userId.slice(0, 6)}</span>
            <span className={styles.mode}>[{m.mode}]</span>
            {m.rollPayload ? (
              <span className={styles.roll}>
                {m.rollPayload.expression} = <strong>{m.rollPayload.total}</strong>{' '}
                ({m.rollPayload.rolls.join(', ')})
              </span>
            ) : (
              <span className={styles.text}>{m.text}</span>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={onSubmit} className={styles.form}>
        <div className={styles.formRow}>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as ChatMode)}
            aria-label={t('chat.modeLabel')}
          >
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          {mode === 'whisper' && (
            <select
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              aria-label={t('chat.recipientLabel')}
              required
            >
              <option value="">{t('chat.selectRecipient')}</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>{m.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className={styles.formRow}>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('chat.messagePlaceholder')}
            aria-label={t('chat.messageInputLabel', { defaultValue: t('chat.panelLabel') })}
          />
          <button type="submit" className={styles.btnSend} aria-label={t('common:btn.send')}>
            {t('common:btn.send')}
          </button>
        </div>
        <p className={styles.hint}>/roll 2d6, /w player, /ooc</p>
      </form>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>
  );
}
