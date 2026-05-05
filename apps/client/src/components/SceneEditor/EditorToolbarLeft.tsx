import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { clearFogMask, hydrateScene } from '../../store/scene';
import { apiAddImageAnnotation, apiPatchScene } from '../../api/scenes';
import { emitFogClear } from '../../api/socket';
import ImageUpload from '../AssetUpload/ImageUpload';
import AssetLibrary from '../AssetLibrary/AssetLibrary';
import GenerateBackgroundModal from '../AIGenerate/GenerateBackgroundModal';
import AddTokenButton from '../GameCanvas/AddTokenButton';
import styles from './EditorToolbarLeft.module.css';

interface EditorToolbarLeftProps {
  roomId: string;
  sceneId: string;
}

export default function EditorToolbarLeft({ roomId, sceneId }: EditorToolbarLeftProps): JSX.Element {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['room', 'errors']);
  const scene = useAppSelector((s) => s.scene.current);
  const tokens = scene?.tokens ?? [];
  // SceneDTO carries backgroundUrl (signed), not the assetId. Extract the id
  // from the path so AssetLibrary can highlight the active card.
  const activeBackgroundAssetId = (() => {
    const url = scene?.backgroundUrl;
    if (!url) return undefined;
    const m = /\/api\/assets\/([^/]+)\/file/.exec(url);
    return m ? m[1] : undefined;
  })();

  const [aiOpen, setAiOpen] = useState(false);
  const [gridSize, setGridSize] = useState(String(scene?.gridSize ?? 50));
  const [gridWidth, setGridWidth] = useState(String(scene?.gridWidth ?? 20));
  const [gridHeight, setGridHeight] = useState(String(scene?.gridHeight ?? 15));
  const [gridVisible, setGridVisible] = useState(scene?.gridVisible ?? true);
  const [gridSaving, setGridSaving] = useState(false);
  const [gridError, setGridError] = useState<string | null>(null);

  useEffect(() => {
    if (!scene) return;
    setGridSize(String(scene.gridSize));
    setGridWidth(String(scene.gridWidth));
    setGridHeight(String(scene.gridHeight));
    setGridVisible(scene.gridVisible);
  }, [scene]);

  async function handleGridSave(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setGridSaving(true);
    setGridError(null);
    try {
      const updated = await apiPatchScene(sceneId, {
        gridSize: Number(gridSize),
        gridWidth: Number(gridWidth),
        gridHeight: Number(gridHeight),
        gridVisible,
      }, { staged: true });
      // PATCH now returns the fully-projected SceneDTO (signed backgroundUrl,
      // tokens, annotations) — drop the fragile spread-merge.
      dispatch(hydrateScene(updated));
    } catch (err) {
      setGridError(err instanceof Error ? err.message : t('errors:network.saveFailed'));
    } finally {
      setGridSaving(false);
    }
  }

  // Set the asset as the scene background.
  async function handleSetBackground(asset: AssetDTO): Promise<void> {
    const updated = await apiPatchScene(sceneId, { backgroundAssetId: asset.id }, { staged: true });
    dispatch(hydrateScene(updated));
  }

  // Place the asset as an overlay near the scene center so the user sees it
  // immediately, instead of a hardcoded (64, 64) corner.
  async function handleAddToScene(asset: AssetDTO): Promise<void> {
    const sceneW = (scene?.gridWidth ?? 20) * (scene?.gridSize ?? 50);
    const sceneH = (scene?.gridHeight ?? 15) * (scene?.gridSize ?? 50);
    const w = 256;
    const h = 256;
    await apiAddImageAnnotation(sceneId, {
      x: Math.round(sceneW / 2 - w / 2),
      y: Math.round(sceneH / 2 - h / 2),
      assetId: asset.id,
      width: w,
      height: h,
    });
  }

  return (
    <aside className={styles.toolbar} aria-label={t('sceneEditor.leftToolbar.label')}>
      <section className={styles.section}>
        <p className={styles.heading}>{t('sceneEditor.leftToolbar.assetLibrary')}</p>
        <ImageUpload roomId={roomId} />
        <button
          type="button"
          className={styles.aiBtn}
          onClick={() => setAiOpen(true)}
        >
          {t('sceneEditor.bg.aiBtn')}
        </button>
        <AssetLibrary
          roomId={roomId}
          tabs={['images']}
          activeBackgroundAssetId={activeBackgroundAssetId}
          onSetBackground={(a) => void handleSetBackground(a)}
          onAddToScene={(a) => void handleAddToScene(a)}
        />
      </section>

      <section className={styles.section}>
        <p className={styles.heading}>{t('sceneEditor.leftToolbar.grid')}</p>
        <form onSubmit={(e) => void handleGridSave(e)} className={styles.gridForm}>
          <label className={styles.fieldRow}>
            <span className={styles.fieldLabel}>{t('sceneEditor.grid.visibleLabel')}</span>
            <input
              type="checkbox"
              checked={gridVisible}
              onChange={(e) => setGridVisible(e.target.checked)}
              aria-label={t('sceneEditor.grid.visibleLabel')}
            />
          </label>
          <label className={styles.fieldRow}>
            <span className={styles.fieldLabel}>{t('sceneEditor.grid.sizeLabel')}</span>
            <input
              type="number"
              className={styles.numInput}
              value={gridSize}
              min={20}
              max={200}
              onChange={(e) => setGridSize(e.target.value)}
              aria-label={t('sceneEditor.grid.sizeLabel')}
            />
          </label>
          <label className={styles.fieldRow}>
            <span className={styles.fieldLabel}>{t('sceneEditor.grid.widthLabel')}</span>
            <input
              type="number"
              className={styles.numInput}
              value={gridWidth}
              min={1}
              max={100}
              onChange={(e) => setGridWidth(e.target.value)}
              aria-label={t('sceneEditor.grid.widthLabel')}
            />
          </label>
          <label className={styles.fieldRow}>
            <span className={styles.fieldLabel}>{t('sceneEditor.grid.heightLabel')}</span>
            <input
              type="number"
              className={styles.numInput}
              value={gridHeight}
              min={1}
              max={100}
              onChange={(e) => setGridHeight(e.target.value)}
              aria-label={t('sceneEditor.grid.heightLabel')}
            />
          </label>
          {gridError && <p role="alert" className={styles.error}>{gridError}</p>}
          <button type="submit" className={styles.saveBtn} disabled={gridSaving}>
            {t('sceneEditor.grid.saveBtn')}
          </button>
        </form>
      </section>

      <section className={styles.section}>
        <p className={styles.heading}>{t('sceneEditor.leftToolbar.tokens')}</p>
        <ul className={styles.tokenList}>
          {tokens.map((tk) => (
            <li key={tk.id} className={styles.tokenItem}>
              {tk.imageUrl ? (
                <img src={tk.imageUrl} alt="" className={styles.tokenThumb} />
              ) : (
                <span
                  className={styles.tokenThumbPlaceholder}
                  style={{ background: tk.color ?? '#7c5cff' }}
                />
              )}
              <span>{tk.name}</span>
            </li>
          ))}
        </ul>
        <AddTokenButton myRole="GM" sceneId={sceneId} />
      </section>

      <section className={styles.section}>
        <p className={styles.heading}>{t('sceneEditor.leftToolbar.fog')}</p>
        <button
          type="button"
          className={styles.fogBtn}
          onClick={() => {
            dispatch(clearFogMask());
            emitFogClear(roomId, sceneId);
          }}
        >
          {t('sceneEditor.fog.clearBtn')}
        </button>
      </section>

      {aiOpen && (
        <GenerateBackgroundModal
          roomId={roomId}
          sceneId={sceneId}
          onClose={() => setAiOpen(false)}
        />
      )}
    </aside>
  );
}
