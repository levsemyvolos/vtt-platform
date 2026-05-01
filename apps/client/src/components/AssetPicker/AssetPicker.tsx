import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetDTO } from '@vtt/shared';
import { listRoomAssets } from '../../api/assets';
import styles from './AssetPicker.module.css';

interface AssetPickerProps {
  roomId: string;
  onPick: (assetId: string) => void;
}

export default function AssetPicker({ roomId, onPick }: AssetPickerProps): JSX.Element {
  const { t } = useTranslation(['room', 'errors']);
  const [assets, setAssets] = useState<AssetDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    listRoomAssets(roomId)
      .then((list) => {
        setAssets(list.filter((a) => a.type.startsWith('image/')));
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : t('errors:network.loadFailed'));
      })
      .finally(() => setLoading(false));
  }, [roomId, t]);

  function handlePick(assetId: string): void {
    setSelected(assetId);
    onPick(assetId);
  }

  if (loading) return <p className={styles.status}>{t('room:asset.loadingGallery')}</p>;
  if (error) return <p className={`${styles.status} ${styles.statusError}`}>{error}</p>;

  return (
    <div className={styles.picker}>
      {assets.length === 0 ? (
        <p className={styles.empty}>{t('room:asset.empty')}</p>
      ) : (
        <ul className={styles.grid} role="listbox" aria-label={t('room:asset.galleryLabel')}>
          {assets.map((asset) => (
            <li key={asset.id} role="option" aria-selected={selected === asset.id}>
              <button
                type="button"
                className={selected === asset.id ? `${styles.item} ${styles.itemSelected}` : styles.item}
                onClick={() => handlePick(asset.id)}
                title={asset.name}
                aria-label={t('room:asset.selectImage', { name: asset.name })}
              >
                <img
                  src={asset.url}
                  alt={asset.name}
                  className={styles.thumb}
                  loading="lazy"
                />
                <span className={styles.name}>{asset.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
