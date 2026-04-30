import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

interface InputBarProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

export default function InputBar({ onSend, disabled }: InputBarProps): JSX.Element {
  const { t } = useTranslation('assistant');
  const [text, setText] = useState('');

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="assistant-panel__input-bar">
      <textarea
        className="assistant-panel__textarea"
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
        className="assistant-panel__send-btn"
        onClick={handleSend}
        disabled={disabled || !text.trim()}
        aria-label={t('input.sendLabel')}
      >
        {disabled ? t('input.sending') : t('input.sendBtn')}
      </button>
    </div>
  );
}
