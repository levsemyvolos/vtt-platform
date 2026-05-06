import { useState, useMemo, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetDTO, CreateTokenRequest, Role, TokenPublicDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { apiFetch } from '../../api/apiFetch';
import { upsertToken } from '../../store/scene';
import ImageUpload from '../AssetUpload/ImageUpload';
import styles from './AddTokenButton.module.css';
import { findFreeTokenSpawn } from './tokenPlacement';

interface AddTokenButtonProps {
  myRole: Role;
  sceneId: string;
}

export default function AddTokenButton({ myRole, sceneId }: AddTokenButtonProps): JSX.Element | null {
  const { t } = useTranslation(['room', 'common', 'errors']);
  const dispatch = useAppDispatch();
  const { current: scene } = useAppSelector((s) => s.scene);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [asset, setAsset] = useState<AssetDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewSpawn = useMemo(
    () =>
      scene
        ? findFreeTokenSpawn({
            existingTokens: scene.tokens,
            gridSize: scene.gridSize,
            gridWidth: scene.gridWidth,
            gridHeight: scene.gridHeight,
          })
        : { x: 0, y: 0 },
    [scene],
  );

  if (myRole !== 'GM') return null;

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!scene) return;
    setBusy(true);
    setError(null);
    try {
      const spawn = findFreeTokenSpawn({
        existingTokens: scene.tokens,
        gridSize: scene.gridSize,
        gridWidth: scene.gridWidth,
        gridHeight: scene.gridHeight,
      });
      const body: CreateTokenRequest = {
        name: name.trim(),
        x: spawn.x,
        y: spawn.y,
        ...(asset ? { imageAssetId: asset.id } : {}),
      };
      const token = await apiFetch<TokenPublicDTO>(`/api/scenes/${sceneId}/tokens`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      dispatch(upsertToken(token));
      setName('');
      setAsset(null);
      setShowModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors:network.tokenAddFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.triggerBtn}
        onClick={() => setShowModal(true)}
        title={t('room:token.addTitle')}
        aria-label={t('room:token.addLabel')}
      >
        {t('room:token.addBtn')}
      </button>

      {showModal && scene && (
        <div
          className={styles.backdrop}
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModal(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('room:token.addModalLabel')}
            className={styles.modal}
          >
            <h3>{t('room:token.addModalHeading')}</h3>
            <form onSubmit={(e) => void handleSubmit(e)} aria-label={t('room:token.tokenFormLabel')} noValidate>
              <div className={styles.field}>
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

              <ImageUpload roomId={scene.roomId} onUploaded={setAsset} />
              {asset && <p className={styles.note}>{asset.name}</p>}

              <p className={styles.note}>
                {t('room:token.tokenPlacedNote', {
                  x: previewSpawn.x,
                  y: previewSpawn.y,
                })}
              </p>
              {error && <p role="alert" className={styles.error}>{error}</p>}
              <div className={styles.actions}>
                <button type="button" className={styles.btnCancel} onClick={() => setShowModal(false)} disabled={busy}>
                  {t('common:btn.cancel')}
                </button>
                <button type="submit" className={styles.btnSubmit} disabled={busy || !name.trim()}>
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
