import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { lookupSRD } from '../../api/ai';
import { ApiError } from '../../api/apiFetch';
import { mapAIErrorKindToI18n } from '../../store/assistant';
import i18next from 'i18next';
import styles from './PlayerSRDPopover.module.css';

interface PlayerSRDPopoverProps {
  roomId: string;
  onClose: () => void;
}

export default function PlayerSRDPopover({ roomId, onClose }: PlayerSRDPopoverProps): JSX.Element {
  const { t } = useTranslation('gameroom');
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(): Promise<void> {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setAnswer(null);
    setErrorKey(null);
    try {
      const res = await lookupSRD({ roomId, prompt: trimmed });
      setAnswer(res.content);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorKey(mapAIErrorKindToI18n(err.kind, err.status));
      } else {
        setErrorKey('errors:ai.unknown');
      }
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void handleSubmit();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  }

  return (
    <div className={styles.overlay} role="dialog" aria-label={t('srd.title')}>
      <div className={styles.popover}>
        <div className={styles.header}>
          <span className={styles.title}>{t('srd.title')}</span>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={t('srd.close')}
          >
            ✕
          </button>
        </div>
        <p className={styles.hint}>{t('srd.hint')}</p>
        <textarea
          ref={inputRef}
          className={styles.textarea}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('srd.placeholder')}
          rows={3}
          disabled={loading}
          aria-label={t('srd.placeholder')}
          maxLength={1000}
        />
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.askBtn}
            onClick={() => void handleSubmit()}
            disabled={loading || !prompt.trim()}
          >
            {loading ? t('srd.asking') : t('srd.ask')}
          </button>
        </div>
        {errorKey && (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <p className={styles.error} role="alert">{i18next.t(errorKey as any)}</p>
        )}
        {answer && (
          <div className={styles.answer}>
            <ReactMarkdown>{answer}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
