import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  fetchRoomAssets,
  makeSelectRoomAssets,
  renameAsset,
} from '../../store/assets';
import AssetCard, { type AssetCardActions } from './AssetCard';
import styles from './AssetLibrary.module.css';

type FilterTab = 'all' | 'images' | 'audio' | 'pdfs';

interface AssetLibraryProps extends Omit<AssetCardActions, 'onRename'> {
  roomId: string;
  /** When provided, the matching card is highlighted with the "Active" badge. */
  activeBackgroundAssetId?: string | undefined;
  /** Initial tab; defaults to 'images' since the editor cares about images first. */
  initialFilter?: FilterTab | undefined;
  /** Whitelist of visible tabs. Default: all 4. Tab bar is hidden if length === 1. */
  tabs?: FilterTab[] | undefined;
}

function matchesFilter(asset: AssetDTO, filter: FilterTab): boolean {
  switch (filter) {
    case 'all': return true;
    case 'images': return asset.type.startsWith('image/');
    case 'audio': return asset.type.startsWith('audio/');
    case 'pdfs': return asset.type === 'application/pdf';
  }
}

const ALL_TABS: FilterTab[] = ['all', 'images', 'audio', 'pdfs'];

export default function AssetLibrary({
  roomId,
  activeBackgroundAssetId,
  initialFilter,
  tabs: tabsProp,
  onSetBackground,
  onAddToScene,
  onDelete,
  onPick,
  pickLabel,
}: AssetLibraryProps): JSX.Element {
  const { t } = useTranslation('room');
  const dispatch = useAppDispatch();
  const selector = useMemo(() => makeSelectRoomAssets(roomId), [roomId]);
  const assets = useAppSelector(selector);
  const loading = useAppSelector((s) => s.assets.loadingRooms[roomId] ?? false);
  const error = useAppSelector((s) => s.assets.error);

  const visibleTabs = tabsProp ?? ALL_TABS;
  const [filter, setFilter] = useState<FilterTab>(initialFilter ?? visibleTabs[0] ?? 'images');

  useEffect(() => {
    void dispatch(fetchRoomAssets(roomId));
  }, [dispatch, roomId]);

  const filtered = assets.filter((a) => matchesFilter(a, filter));

  async function handleRename(asset: AssetDTO, name: string): Promise<void> {
    await dispatch(renameAsset({ id: asset.id, name })).unwrap().catch(() => undefined);
  }

  const tabLabels: Record<FilterTab, string> = {
    all: t('sceneEditor.assetLibrary.filter.all'),
    images: t('sceneEditor.assetLibrary.filter.images'),
    audio: t('sceneEditor.assetLibrary.filter.audio'),
    pdfs: t('sceneEditor.assetLibrary.filter.pdfs'),
  };
  const tabs = visibleTabs.map((id) => ({ id, label: tabLabels[id] }));

  return (
    <div className={styles.library}>
      {tabs.length > 1 && (
      <div className={styles.tabs} role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={filter === tab.id}
            className={`${styles.tab} ${filter === tab.id ? styles.tabActive : ''}`}
            onClick={() => setFilter(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      )}
      {loading && assets.length === 0 ? (
        <p className={styles.status}>{t('sceneEditor.assetLibrary.loading')}</p>
      ) : error ? (
        <p className={`${styles.status} ${styles.statusError}`}>{error}</p>
      ) : filtered.length === 0 ? (
        <p className={styles.empty}>{t('sceneEditor.assetLibrary.empty')}</p>
      ) : (
        <div className={styles.grid}>
          {filtered.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              isActiveBackground={asset.id === activeBackgroundAssetId}
              onSetBackground={onSetBackground}
              onAddToScene={onAddToScene}
              onDelete={onDelete}
              onRename={handleRename}
              onPick={onPick}
              pickLabel={pickLabel}
            />
          ))}
        </div>
      )}
    </div>
  );
}
