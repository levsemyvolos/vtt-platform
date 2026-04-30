import type { AssistantContext, ConversationMessage } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';

const EMPTY_MESSAGES: ConversationMessage[] = [];
import { sendAssistantMessage, setActiveContext } from '../../store/assistant';
import MessageList from './MessageList';
import InputBar from './InputBar';

interface AssistantPanelProps {
  roomId: string;
  onClose: () => void;
}

const TABS: { id: AssistantContext; label: string }[] = [
  { id: 'npc-description', label: 'NPC' },
  { id: 'scene-description', label: 'Scene' },
  { id: 'srd-lookup', label: 'SRD' },
  { id: 'free-chat', label: 'Free' },
];

export default function AssistantPanel({ roomId, onClose }: AssistantPanelProps): JSX.Element {
  const dispatch = useAppDispatch();
  const activeContext = useAppSelector((s) => s.assistant.activeContext);
  const status = useAppSelector((s) => s.assistant.status);
  const error = useAppSelector((s) => s.assistant.error);

  const conversationId = `${roomId}:${activeContext}`;
  const messages = useAppSelector((s) => s.assistant.conversations[conversationId] ?? EMPTY_MESSAGES);

  function handleTabChange(ctx: AssistantContext) {
    dispatch(setActiveContext(ctx));
  }

  function handleSend(prompt: string) {
    void dispatch(sendAssistantMessage({ context: activeContext, prompt, conversationId }));
  }

  return (
    <div className="assistant-panel" role="dialog" aria-label="GM AI Асистент">
      <div className="assistant-panel__header">
        <span className="assistant-panel__title">GM Асистент</span>
        <button
          type="button"
          className="assistant-panel__close"
          onClick={onClose}
          aria-label="Закрити"
        >
          ✕
        </button>
      </div>
      <nav className="assistant-panel__tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeContext === t.id}
            className={`assistant-panel__tab${activeContext === t.id ? ' assistant-panel__tab--active' : ''}`}
            onClick={() => handleTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <MessageList messages={messages} />
      {error && status === 'error' && (
        <p className="assistant-panel__error" role="alert">
          {error}
        </p>
      )}
      <InputBar onSend={handleSend} disabled={status === 'sending'} />
    </div>
  );
}
