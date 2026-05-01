import ReactMarkdown from 'react-markdown';
import type { ConversationMessage } from '@vtt/shared';
import styles from './AssistantPanel.module.css';

interface MessageListProps {
  messages: ConversationMessage[];
}

export default function MessageList({ messages }: MessageListProps): JSX.Element {
  return (
    <div className={styles.messages}>
      {messages.length === 0 && (
        <p className={styles.empty}>Задайте питання GM-асистенту.</p>
      )}
      {messages.map((msg, idx) => (
        <div
          key={idx}
          className={`${styles.message} ${msg.role === 'user' ? styles.messageUser : styles.messageAssistant}`}
        >
          <span className={styles.messageRole}>
            {msg.role === 'user' ? 'Ви' : 'Асистент'}
          </span>
          <div className={styles.messageBubble}>
            {msg.role === 'assistant' ? (
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            ) : (
              <p>{msg.content}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
