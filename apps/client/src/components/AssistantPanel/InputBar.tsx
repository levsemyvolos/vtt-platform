import { useState, type KeyboardEvent } from 'react';

interface InputBarProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

export default function InputBar({ onSend, disabled }: InputBarProps): JSX.Element {
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
        placeholder="Запитайте GM-асистента… (Ctrl+Enter — відправити)"
        rows={3}
        disabled={disabled}
        aria-label="Повідомлення GM-асистенту"
      />
      <button
        type="button"
        className="assistant-panel__send-btn"
        onClick={handleSend}
        disabled={disabled || !text.trim()}
        aria-label="Відправити"
      >
        {disabled ? 'Надсилання…' : 'Відправити'}
      </button>
    </div>
  );
}
