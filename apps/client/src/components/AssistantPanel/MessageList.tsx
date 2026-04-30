import ReactMarkdown from 'react-markdown';
import type { ConversationMessage } from '@vtt/shared';

interface MessageListProps {
  messages: ConversationMessage[];
}

export default function MessageList({ messages }: MessageListProps): JSX.Element {
  return (
    <div className="assistant-panel__messages">
      {messages.length === 0 && (
        <p className="assistant-panel__empty">Задайте питання GM-асистенту.</p>
      )}
      {messages.map((msg, idx) => (
        <div
          key={idx}
          className={`assistant-panel__message assistant-panel__message--${msg.role}`}
        >
          <span className="assistant-panel__message-role">
            {msg.role === 'user' ? 'Ви' : 'Асистент'}
          </span>
          {msg.role === 'assistant' ? (
            <ReactMarkdown>{msg.content}</ReactMarkdown>
          ) : (
            <p>{msg.content}</p>
          )}
        </div>
      ))}
    </div>
  );
}
