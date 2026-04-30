import { useState } from 'react';
import { apiFetch } from '../../api/apiFetch';

interface InviteTokens {
  playerToken: string;
  observerToken: string;
}

interface InviteLinkProps {
  roomId: string;
}

export default function InviteLink({ roomId }: InviteLinkProps): JSX.Element {
  const [tokens, setTokens] = useState<InviteTokens | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'player' | 'observer' | null>(null);

  async function fetchTokens(): Promise<void> {
    if (tokens) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<InviteTokens>(`/api/rooms/${roomId}/invites`, {
        method: 'POST',
      });
      setTokens(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не вдалося отримати посилання');
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard(token: string, type: 'player' | 'observer'): Promise<void> {
    const url = `${window.location.origin}/?invite=${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('Не вдалося скопіювати — скопіюйте вручну');
    }
  }

  return (
    <div className="invite-link">
      {!tokens && !loading && (
        <button
          type="button"
          className="btn-invite"
          onClick={() => void fetchTokens()}
          title="Отримати посилання для запрошення гравців"
        >
          Запросити гравців
        </button>
      )}

      {loading && <span className="invite-link__status">Завантаження…</span>}

      {error && (
        <p role="alert" className="invite-link__error">
          {error}
        </p>
      )}

      {tokens && (
        <div className="invite-link__panel">
          <div className="invite-link__row">
            <span className="invite-link__label">Гравець:</span>
            <button
              type="button"
              className="btn-copy"
              onClick={() => void copyToClipboard(tokens.playerToken, 'player')}
              title={`${window.location.origin}/?invite=${tokens.playerToken}`}
            >
              {copied === 'player' ? 'Скопійовано!' : 'Скопіювати'}
            </button>
          </div>
          <div className="invite-link__row">
            <span className="invite-link__label">Спостерігач:</span>
            <button
              type="button"
              className="btn-copy"
              onClick={() => void copyToClipboard(tokens.observerToken, 'observer')}
              title={`${window.location.origin}/?invite=${tokens.observerToken}`}
            >
              {copied === 'observer' ? 'Скопійовано!' : 'Скопіювати'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
