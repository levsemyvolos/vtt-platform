import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Role } from '@vtt/shared';
import { useAppSelector } from '../../store';
import { apiFetch, ApiError } from '../../api/apiFetch';

interface AddTokenButtonProps {
  myRole: Role;
  sceneId: string;
}

interface TokenCreateRequest {
  name: string;
  imageUrl: string;
  x: number;
  y: number;
  clientSeq: number;
}

export default function AddTokenButton({ myRole, sceneId }: AddTokenButtonProps): JSX.Element | null {
  const { t } = useTranslation(['room', 'common', 'errors']);
  const { current: scene, version } = useAppSelector((s) => s.scene);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (myRole !== 'GM') return null;

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!scene) return;
    setBusy(true);
    setError(null);
    try {
      const clientSeq = version;
      const x = Math.floor(scene.gridWidth / 2);
      const y = Math.floor(scene.gridHeight / 2);
      const body: TokenCreateRequest = { name: name.trim(), imageUrl: imageUrl.trim(), x, y, clientSeq };
      await apiFetch(`/api/scenes/${sceneId}/tokens`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setName('');
      setImageUrl('');
      setShowModal(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError('Endpoint /scenes/:id/tokens ще не реалізовано — буде додано у Чаті 7.4.');
      } else {
        setError(err instanceof Error ? err.message : t('errors:network.tokenAddFailed'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="canvas-toolbar__btn"
        onClick={() => setShowModal(true)}
        title={t('room:token.addTitle')}
        aria-label={t('room:token.addLabel')}
      >
        {t('room:token.addBtn')}
      </button>

      {showModal && (
        <div role="dialog" aria-modal="true" aria-label={t('room:token.addModalLabel')} className="modal-backdrop">
          <div className="modal">
            <h3>{t('room:token.addModalHeading')}</h3>
            <form onSubmit={(e) => void handleSubmit(e)} aria-label={t('room:token.tokenFormLabel')} noValidate>
              <div className="field">
                <label htmlFor="token-name">{t('common:label.name')}</label>
                <input
                  id="token-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={60}
                  autoFocus
                />
              </div>
              <div className="field">
                <label htmlFor="token-image">{t('room:token.imageUrlLabel')}</label>
                <input
                  id="token-image"
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  required
                  placeholder="https://..."
                />
              </div>
              <p className="modal__note">
                {t('room:token.tokenPlacedNote', {
                  x: scene ? Math.floor(scene.gridWidth / 2) : '—',
                  y: scene ? Math.floor(scene.gridHeight / 2) : '—',
                })}
              </p>
              {error && (
                <p role="alert" className="modal__error">
                  {error}
                </p>
              )}
              <div className="modal__actions">
                <button type="button" onClick={() => setShowModal(false)} disabled={busy}>
                  {t('common:btn.cancel')}
                </button>
                <button type="submit" disabled={busy}>
                  {busy ? t('room:token.adding') : t('room:token.addSubmitBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
