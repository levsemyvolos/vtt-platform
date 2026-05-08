import { useState, useMemo, useEffect, useRef, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import type { ChatMode } from '@vtt/shared';
import { useAppSelector } from '../../store';
import { emitChatMessage, emitDiceRoll } from '../../api/socket';
import { Button, Input } from '../ui';
import styles from './ChatPanel.module.css';
import { parseChatCommand } from '../../utils/chatCommands';

interface ChatPanelProps {
  roomId: string;
}

export default function ChatPanel({ roomId }: ChatPanelProps): JSX.Element {
  const { t } = useTranslation(['room', 'common', 'errors']);
  const messages = useAppSelector((s) => s.chat.messages);
  const members = useAppSelector((s) => s.room.members);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<ChatMode>('ic');
  const [recipientId, setRecipientId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const listRef = useRef<HTMLUListElement>(null);

  const memberById = useMemo(
    () => new Map(members.map((m) => [m.userId, m.name])),
    [members],
  );

  function authorLabel(userId: string): string {
    return memberById.get(userId) ?? userId.slice(0, 6);
  }

  const filteredMessages = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => {
      const author = (memberById.get(m.userId) ?? '').toLowerCase();
      const text = (m.text ?? '').toLowerCase();
      const expr = m.rollPayload?.expression.toLowerCase() ?? '';
      return author.includes(q) || text.includes(q) || expr.includes(q);
    });
  }, [messages, search, memberById]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [filteredMessages.length]);

  async function dispatchCommand(parsed: ReturnType<typeof parseChatCommand>): Promise<boolean> {
    if (parsed.kind === 'plain') {
      await emitChatMessage({
        roomId,
        text: parsed.text,
        mode,
        ...(mode === 'whisper' && recipientId ? { recipientId } : {}),
      });
      return true;
    }
    if (parsed.kind === 'roll') {
      await emitDiceRoll({ roomId, expression: parsed.expression, mode: parsed.mode, secret: parsed.secret });
      return true;
    }
    if (parsed.kind === 'ooc') {
      await emitChatMessage({ roomId, mode: 'ooc', text: parsed.text });
      return true;
    }
    if (parsed.kind === 'me') {
      await emitChatMessage({ roomId, mode: 'ic', text: '* ' + parsed.text });
      return true;
    }
    if (parsed.kind === 'whisper') {
      const matches = members.filter(
        (m) => m.name.toLowerCase().startsWith(parsed.recipientQuery.toLowerCase()),
      );
      if (matches.length === 0) { setError(t('errors:chat.recipientNotFound')); return false; }
      if (matches.length > 1) { setError(t('errors:chat.recipientAmbiguous')); return false; }
      // matches.length === 1 guaranteed by the guards above
      const recipient = matches[0] as NonNullable<typeof matches[0]>;
      await emitChatMessage({ roomId, mode: 'whisper', recipientId: recipient.userId, text: parsed.text });
      return true;
    }
    // kind === 'invalid'
    setError(t('errors:chat.invalidCommand'));
    return false;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      const ok = await dispatchCommand(parseChatCommand(trimmed));
      if (ok) { setText(''); setError(null); }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    }
  }

  function bubbleClass(m: { mode: string; rollPayload?: unknown }): string {
    if (m.rollPayload) return `${styles.msg} ${styles.bubbleDice}`;
    if (m.mode === 'ooc') return `${styles.msg} ${styles.msgOoc}`;
    if (m.mode === 'whisper') return `${styles.msg} ${styles.msgWhisper}`;
    return `${styles.msg} ${styles.msgIc}`;
  }

  const MODES: { value: ChatMode; label: string }[] = [
    { value: 'ic', label: t('chat.modes.ic') },
    { value: 'ooc', label: t('chat.modes.ooc') },
    { value: 'whisper', label: t('chat.modes.whisper') },
  ];

  return (
    <section className={styles.panel} aria-label={t('chat.panelLabel')}>
      <input
        type="search"
        className={styles.searchInput}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('room:chat.searchPlaceholder')}
        aria-label={t('room:chat.searchPlaceholder')}
      />
      <ul ref={listRef} className={styles.messages}>
        {filteredMessages.map((m) => (
          <li key={m.id} className={bubbleClass(m)}>
            <span className={styles.author}>{authorLabel(m.userId)}</span>
            <time className={styles.timestamp} dateTime={m.createdAt}>
              {new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(m.createdAt))}
            </time>
            {m.rollPayload ? (
              <>
                <span className={`eyebrow ${styles.eyebrowRoll}`}>{t('room:chat.eyebrow.roll')}</span>
                <span className={styles.roll}>
                  {m.rollPayload.expression} = <strong>{m.rollPayload.total}</strong>{' '}
                  ({m.rollPayload.rolls.join(', ')})
                </span>
              </>
            ) : m.mode === 'whisper' ? (
              <>
                <span className={`eyebrow ${styles.eyebrowSecret}`}>
                  <Lock size={10} aria-hidden="true" style={{ color: 'var(--color-text-muted)' }} />
                  {' '}{t('room:chat.eyebrow.whisper')}
                </span>
                <span className={styles.text}>{m.text}</span>
              </>
            ) : (
              <>
                <span className={styles.mode}>[{m.mode}]</span>
                <span className={styles.text}>{m.text}</span>
              </>
            )}
          </li>
        ))}
      </ul>
      {filteredMessages.length === 0 && search.trim() && (
        <p className={styles.searchEmpty}>{t('room:chat.searchEmpty')}</p>
      )}
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
          <Input
            className={styles.msgInput}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('chat.messagePlaceholder')}
            aria-label={t('chat.messageInputLabel', { defaultValue: t('chat.panelLabel') })}
          />
          <Button type="submit" variant="primary" size="sm" aria-label={t('common:btn.send')}>
            {t('common:btn.send')}
          </Button>
        </div>
        <p className={styles.hint}>{t('room:chat.commandHint')}</p>
      </form>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>
  );
}
