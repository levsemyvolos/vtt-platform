import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import type { ConversationMessage } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { sendAssistantMessage } from '../../store/assistant';
import { useUnboundFeatureToast } from '../../hooks/useUnboundFeatureToast';
import styles from './ConversationView.module.css';

export type MainTab = 'llm' | 'image' | 'music' | 'history';

// ─── LLM chat panel ────────────────────────────────────────────────────────

interface LlmPanelProps {
  roomId: string;
}

function LlmPanel({ roomId }: LlmPanelProps): JSX.Element {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('assistant');
  const activeContext = useAppSelector((s) => s.assistant.activeContext);
  const status = useAppSelector((s) => s.assistant.status);
  const error = useAppSelector((s) => s.assistant.error);
  const conversationId = `${roomId}:${activeContext}`;
  const messages = useAppSelector(
    (s): ConversationMessage[] => s.assistant.conversations[conversationId] ?? [],
  );
  const [text, setText] = useState('');

  function handleSend(): void {
    const trimmed = text.trim();
    if (!trimmed || status === 'sending') return;
    void dispatch(sendAssistantMessage({ context: activeContext, prompt: trimmed, conversationId }));
    setText('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); handleSend(); }
  }

  return (
    <div className={styles.conversation}>
      <div className={styles.messages}>
        {messages.length === 0 && <p className={styles.empty}>{t('conversation.empty')}</p>}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`${styles.message} ${msg.role === 'user' ? styles.messageUser : styles.messageAssistant}`}
          >
            <span className={styles.messageRole}>
              {msg.role === 'user' ? t('conversation.roleUser') : t('conversation.roleAssistant')}
            </span>
            <div className={styles.messageBubble}>
              {msg.role === 'assistant'
                ? <ReactMarkdown>{msg.content}</ReactMarkdown>
                : <p>{msg.content}</p>}
            </div>
            <div className={styles.messageActions}>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => void navigator.clipboard.writeText(msg.content)}
              >
                {t('conversation.actions.copy')}
              </button>
            </div>
          </div>
        ))}
      </div>
      {error && status === 'error' && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.inputBar}>
        <textarea
          className={styles.textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('input.placeholder')}
          rows={3}
          disabled={status === 'sending'}
          aria-label={t('input.inputLabel')}
        />
        <div className={styles.inputActions}>
          <div className={styles.modeChips}>
            <span className={styles.chip}>{t('conversation.chips.npcMode')}</span>
          </div>
          <button
            type="button"
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={status === 'sending' || !text.trim()}
            aria-label={t('input.sendLabel')}
          >
            {status === 'sending' ? t('input.sending') : t('input.sendBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Generate panel (Image / Music) ────────────────────────────────────────

interface GeneratePanelProps {
  type: 'image' | 'music';
}

function GeneratePanel({ type }: GeneratePanelProps): JSX.Element {
  const { t } = useTranslation('assistant');
  const showUnbound = useUnboundFeatureToast();
  const [text, setText] = useState('');
  const featureName = type === 'image' ? 'AI Image Generation' : 'AI Music Generation';
  const promptLabel = type === 'image' ? t('conversation.imagePromptLabel') : t('conversation.musicPromptLabel');
  const hint = type === 'image' ? t('conversation.imageHint') : t('conversation.musicHint');

  return (
    <div className={styles.conversation}>
      <div className={styles.generatePanel}>
        <p className={styles.generateHint}>{hint}</p>
        <textarea
          className={styles.textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={promptLabel}
          rows={4}
          aria-label={promptLabel}
        />
        <button
          type="button"
          className={styles.generateBtn}
          onClick={() => showUnbound(featureName)}
        >
          {t('conversation.generateBtn')}
        </button>
      </div>
    </div>
  );
}

// ─── History panel ──────────────────────────────────────────────────────────

interface HistoryPanelProps {
  roomId: string;
}

function HistoryPanel({ roomId }: HistoryPanelProps): JSX.Element {
  const { t } = useTranslation('assistant');
  const allConversations = useAppSelector((s) => s.assistant.conversations);
  const sessionEntries = Object.entries(allConversations).filter(([key]) =>
    key.startsWith(`${roomId}:`),
  );

  return (
    <div className={styles.conversation}>
      <div className={styles.messages}>
        {sessionEntries.length === 0 && (
          <p className={styles.empty}>{t('conversation.historyEmpty')}</p>
        )}
        {sessionEntries.map(([id, msgs]) => (
          <div key={id} className={styles.historyGroup}>
            <p className={styles.historyId}>{id.replace(`${roomId}:`, '')}</p>
            {msgs.slice(-3).map((msg, idx) => (
              <p key={idx} className={styles.historyMsg}>
                <strong>
                  {msg.role === 'user' ? t('conversation.roleUser') : t('conversation.roleAssistant')}:
                </strong>{' '}
                {msg.content.length > 80 ? `${msg.content.slice(0, 80)}…` : msg.content}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Public component ───────────────────────────────────────────────────────

interface ConversationViewProps {
  roomId: string;
  mainTab: MainTab;
}

export default function ConversationView({ roomId, mainTab }: ConversationViewProps): JSX.Element {
  if (mainTab === 'llm') return <LlmPanel roomId={roomId} />;
  if (mainTab === 'image' || mainTab === 'music') return <GeneratePanel type={mainTab} />;
  return <HistoryPanel roomId={roomId} />;
}
