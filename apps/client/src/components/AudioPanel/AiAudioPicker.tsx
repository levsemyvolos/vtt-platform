import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import type { AssetDTO, AudioLayer } from '@vtt/shared';
import { listAiAssets } from '../../api/assets';
import { useAppDispatch } from '../../store';
import { addTrackFromAiAsset } from '../../store/audio';
import { addToast } from '../../store/toast';
import panelStyles from './AudioPanel.module.css';
import styles from './AiAudioPicker.module.css';

interface Props {
  roomId: string;
  sceneId: string | null;
  layer: AudioLayer;
}

/**
 * S5.5 P7 — picker that lists AI-generated audio Assets of the current room
 * and lets the GM register one as an AudioTrack in this layer + (optional)
 * scene binding without a fresh upload. Mirrors the open/close affordance
 * of TrackUpload so the two entry points sit side-by-side.
 *
 * The server's `createTrackFromAsset` is idempotent on
 * (room, asset, scene, layer), so re-adding the same asset is a no-op
 * rather than a duplicate row (S5.5 P5).
 */
export default function AiAudioPicker({ roomId, sceneId, layer }: Props): JSX.Element {
  const { t } = useTranslation('campaign');
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AssetDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    listAiAssets(roomId, 'audio')
      .then((dtos) => {
        dtos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setItems(dtos);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : t('audio.aiLibraryError')),
      )
      .finally(() => setLoading(false));
  }, [open, roomId, t]);

  async function handleAdd(asset: AssetDTO): Promise<void> {
    if (busyId !== null) return;
    setBusyId(asset.id);
    try {
      await dispatch(
        addTrackFromAiAsset({
          roomId,
          assetId: asset.id,
          title: asset.name || 'AI Music',
          layer,
          sceneId,
          loop: false,
        }),
      ).unwrap();
      setAddedIds((prev) => new Set(prev).add(asset.id));
      dispatch(addToast('success', t('audio.aiLibraryToastAdded')));
    } catch (err) {
      const msg = typeof err === 'string' ? err : t('audio.aiLibraryError');
      dispatch(addToast('error', msg));
    } finally {
      setBusyId(null);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className={panelStyles.openUploadBtn}
        onClick={() => setOpen(true)}
      >
        <Sparkles size={14} aria-hidden />
        {t('audio.aiLibraryShort')}
      </button>
    );
  }

  return (
    <div className={styles.picker}>
      <header className={styles.header}>
        <span className={styles.heading}>{t('audio.aiLibraryHeading')}</span>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={() => setOpen(false)}
          aria-label={t('audio.aiLibraryClose')}
        >
          ✕
        </button>
      </header>

      {loading && <p className={styles.empty}>{t('audio.aiLibraryLoading')}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className={styles.empty}>{t('audio.aiLibraryEmpty')}</p>
      )}

      {items.length > 0 && (
        <ul className={styles.list}>
          {items.map((asset) => {
            const added = addedIds.has(asset.id);
            const busy = busyId === asset.id;
            return (
              <li key={asset.id} className={styles.item}>
                <span className={styles.itemName} title={asset.aiPrompt ?? asset.name}>
                  {asset.name || 'AI Music'}
                </span>
                <button
                  type="button"
                  className={styles.addBtn}
                  onClick={() => void handleAdd(asset)}
                  disabled={busy || added}
                >
                  {added
                    ? t('audio.aiLibraryAdded')
                    : busy
                    ? t('audio.aiLibraryAdding')
                    : t('audio.aiLibraryAddBtn')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
