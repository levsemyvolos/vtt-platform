import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './AssistantPanel.module.css';

interface InputBarProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

export default function InputBar({ onSend, disabled }: InputBarProps): JSX.Element {
  const { t } = useTranslation('assistant');
  const [text, setText] = useState('');

  function handleSend(): void {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className={styles.inputBar}>
      <textarea
        className={styles.textarea}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('input.placeholder')}
        rows={3}
        disabled={disabled}
        aria-label={t('input.inputLabel')}
      />
      <button
        type="button"
        className={styles.sendBtn}
        onClick={handleSend}
        disabled={disabled || !text.trim()}
        aria-label={t('input.sendLabel')}
      >
        {disabled ? t('input.sending') : t('input.sendBtn')}
      </button>
    </div>
  );
}
