import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import type { AssetDTO, ImageSceneObject, BackgroundFit } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { applyDraftSceneUpdate, clearFogMask, appendSceneObject } from '../../store/scene';
import { emitFogClear } from '../../api/socket';
import { resolveImageDimensions, loadImageNaturalSize as sharedLoadImageNaturalSize } from '../GameCanvas/imageDimensions';
import ImageUpload from '../AssetUpload/ImageUpload';
import AssetLibrary from '../AssetLibrary/AssetLibrary';
import GenerateBackgroundModal from '../AIGenerate/GenerateBackgroundModal';
import GenerateBattlemapModal from '../AIGenerate/GenerateBattlemapModal';
import AddTokenButton from '../GameCanvas/AddTokenButton';
import styles from './EditorToolbarLeft.module.css';

interface EditorToolbarLeftProps {
  roomId: string;
  sceneId: string;
}

/** Reads scene background defaults with safe fallbacks.
 *  Extracted to keep EditorToolbarLeft cyclomatic complexity ≤ 10 (lint gate). */
function getBackgroundDefaults(scene: { backgroundFit?: string; backgroundOffsetX?: number; backgroundOffsetY?: number; backgroundScale?: number } | null): {
  fit: string; offsetX: number; offsetY: number; scale: number;
} {
  return {
    fit: scene?.backgroundFit ?? 'cover',
    offsetX: scene?.backgroundOffsetX ?? 0,
    offsetY: scene?.backgroundOffsetY ?? 0,
    scale: scene?.backgroundScale ?? 1,
  };
}

/** Extracts the assetId embedded in a signed `/api/assets/:id/file` URL.
 *  Extracted to keep EditorToolbarLeft cyclomatic complexity ≤ 10 (lint gate). */
function extractActiveBgAssetId(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const m = /\/api\/assets\/([^/]+)\/file/.exec(url);
  return m ? m[1] : undefined;
}

export default function EditorToolbarLeft({ roomId, sceneId }: EditorToolbarLeftProps): JSX.Element {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['room', 'errors']);
  const scene = useAppSelector((s) => s.scene.current);
  const currentUserId = useAppSelector((s) => s.session.currentUser?.id ?? '');
  const tokens = scene?.tokens ?? [];
  // SceneDTO carries backgroundUrl (signed), not the assetId. Extract the id
  // from the path so AssetLibrary can highlight the active card.
  const activeBackgroundAssetId = extractActiveBgAssetId(scene?.backgroundUrl);
  const bgDefaults = getBackgroundDefaults(scene ?? null);

  const [aiOpen, setAiOpen] = useState(false);
  const [battlemapOpen, setBattlemapOpen] = useState(false);
  const [gridSize, setGridSize] = useState(String(scene?.gridSize ?? 50));
  const [gridWidth, setGridWidth] = useState(String(scene?.gridWidth ?? 20));
  const [gridHeight, setGridHeight] = useState(String(scene?.gridHeight ?? 15));
  const [gridVisible, setGridVisible] = useState(scene?.gridVisible ?? true);
  const [lockAspect, setLockAspect] = useState(false);
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  useEffect(() => {
    if (!scene) return;
    setGridSize(String(scene.gridSize));
    setGridWidth(String(scene.gridWidth));
    setGridHeight(String(scene.gridHeight));
    setGridVisible(scene.gridVisible);
  }, [scene]);

  function handleGridSave(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    dispatch(applyDraftSceneUpdate({
      patch: {
        gridSize: Number(gridSize),
        gridWidth: Number(gridWidth),
        gridHeight: Number(gridHeight),
        gridVisible,
      },
    }));
  }

  function handleGridWidthChange(value: string): void {
    setGridWidth(value);
    if (lockAspect && imageAspect !== null && Number(value) > 0) {
      const newH = Math.max(1, Math.round(Number(value) / imageAspect));
      setGridHeight(String(newH));
    }
  }

  function handleGridHeightChange(value: string): void {
    setGridHeight(value);
    if (lockAspect && imageAspect !== null && Number(value) > 0) {
      const newW = Math.max(1, Math.round(Number(value) * imageAspect));
      setGridWidth(String(newW));
    }
  }

  // Sess 8: replaced local helper with shared imageDimensions module
  const loadImageNaturalSize = sharedLoadImageNaturalSize;

  async function handleFitToImage(): Promise<void> {
    if (!scene?.backgroundUrl) return;
    const size = await loadImageNaturalSize(scene.backgroundUrl);
    if (!size) return;
    const aspect = size.w / size.h;
    const currentGridSize = scene.gridSize;
    const newGridWidth = Math.max(1, Math.round(size.w / currentGridSize));
    const newGridHeight = Math.max(1, Math.round(newGridWidth / aspect));
    setGridWidth(String(newGridWidth));
    setGridHeight(String(newGridHeight));
    dispatch(applyDraftSceneUpdate({
      patch: { gridWidth: newGridWidth, gridHeight: newGridHeight },
    }));
  }

  async function handleToggleLockAspect(checked: boolean): Promise<void> {
    setLockAspect(checked);
    if (checked && scene?.backgroundUrl) {
      const size = await loadImageNaturalSize(scene.backgroundUrl);
      if (size) {
        setImageAspect(size.w / size.h);
      } else {
        setImageAspect(null);
      }
    } else {
      setImageAspect(null);
    }
  }

  // Set the asset as the scene background.
  function handleSetBackground(asset: AssetDTO): void {
    dispatch(applyDraftSceneUpdate({
      patch: { backgroundAssetId: asset.id },
      backgroundUrl: asset.url,
    }));
  }

  // Place the asset as an overlay near the scene center, preserving its natural
  // aspect ratio (Sess 8 — was hardcoded 256×256 square).
  // Edit-mode local buffer: added object goes to local objects[] only and is
  // flushed to the server on Done via scene:flush (scene:flush handler calls
  // drawService.persist). Cancel re-fetches from server, discarding this object.
  async function handleAddToScene(asset: AssetDTO): Promise<void> {
    if (!scene) return;
    const sceneW = (scene.gridWidth ?? 20) * (scene.gridSize ?? 50);
    const sceneH = (scene.gridHeight ?? 15) * (scene.gridSize ?? 50);
    const { w, h } = await resolveImageDimensions(asset.url, scene.gridSize ?? 50);
    const x = Math.round(sceneW / 2 - w / 2);
    const y = Math.round(sceneH / 2 - h / 2);
    const peers = scene.annotations?.objects ?? [];
    const zIndex = peers.length > 0
      ? Math.max(...peers.map((o) => o.zIndex)) + 1
      : 0;
    const newObject: ImageSceneObject = {
      id: crypto.randomUUID(),
      type: 'image',
      userId: currentUserId,
      x,
      y,
      width: w,
      height: h,
      zIndex,
      assetId: asset.id,
      layer: 'tile',
      visibility: 'all',
    };
    dispatch(appendSceneObject(newObject));
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
          <Sparkles size={12} strokeWidth={1.5} aria-hidden />
          {t('sceneEditor.bg.aiBtn')}
        </button>
        <button
          type="button"
          className={styles.aiBtn}
          onClick={() => setBattlemapOpen(true)}
        >
          <Sparkles size={12} strokeWidth={1.5} aria-hidden />
          {t('sceneEditor.bg.battlemapBtn')}
        </button>
        <AssetLibrary
          roomId={roomId}
          tabs={['images']}
          activeBackgroundAssetId={activeBackgroundAssetId}
          onSetBackground={(a) => handleSetBackground(a)}
          onAddToScene={(a) => { void handleAddToScene(a); }}
        />
      </section>

      <section className={styles.section}>
        <p className={styles.heading}>{t('sceneEditor.leftToolbar.background')}</p>
        <label className={styles.fieldRow}>
          <span className={styles.fieldLabel}>{t('sceneEditor.bg.fitLabel')}</span>
          <select
            className={styles.numInput}
            value={bgDefaults.fit}
            onChange={(e) => dispatch(applyDraftSceneUpdate({
              patch: { backgroundFit: e.target.value as BackgroundFit },
            }))}
            aria-label={t('sceneEditor.bg.fitLabel')}
          >
            <option value="cover">{t('sceneEditor.bg.fit.cover')}</option>
            <option value="contain">{t('sceneEditor.bg.fit.contain')}</option>
            <option value="stretch">{t('sceneEditor.bg.fit.stretch')}</option>
          </select>
        </label>
        <label className={styles.fieldRow}>
          <span className={styles.fieldLabel}>{t('sceneEditor.bg.offsetXLabel')}</span>
          <input
            type="number"
            className={styles.numInput}
            value={bgDefaults.offsetX}
            step={10}
            onChange={(e) => dispatch(applyDraftSceneUpdate({
              patch: { backgroundOffsetX: Number(e.target.value) },
            }))}
            aria-label={t('sceneEditor.bg.offsetXLabel')}
          />
        </label>
        <label className={styles.fieldRow}>
          <span className={styles.fieldLabel}>{t('sceneEditor.bg.offsetYLabel')}</span>
          <input
            type="number"
            className={styles.numInput}
            value={bgDefaults.offsetY}
            step={10}
            onChange={(e) => dispatch(applyDraftSceneUpdate({
              patch: { backgroundOffsetY: Number(e.target.value) },
            }))}
            aria-label={t('sceneEditor.bg.offsetYLabel')}
          />
        </label>
        <label className={styles.fieldRow}>
          <span className={styles.fieldLabel}>{t('sceneEditor.bg.scaleLabel')}</span>
          <input
            type="number"
            className={styles.numInput}
            value={bgDefaults.scale}
            step={0.1}
            min={0.05}
            max={20}
            onChange={(e) => dispatch(applyDraftSceneUpdate({
              patch: { backgroundScale: Number(e.target.value) },
            }))}
            aria-label={t('sceneEditor.bg.scaleLabel')}
          />
        </label>
        <button
          type="button"
          className={styles.saveBtn}
          onClick={() => { void handleFitToImage(); }}
          disabled={!scene?.backgroundUrl}
        >
          {t('sceneEditor.bg.fitToImageBtn')}
        </button>
      </section>

      <section className={styles.section}>
        <p className={styles.heading}>{t('sceneEditor.leftToolbar.grid')}</p>
        <form onSubmit={(e) => handleGridSave(e)} className={styles.gridForm}>
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
            <span className={styles.fieldLabel}>{t('sceneEditor.grid.lockAspectLabel')}</span>
            <input
              type="checkbox"
              checked={lockAspect}
              onChange={(e) => { void handleToggleLockAspect(e.target.checked); }}
              aria-label={t('sceneEditor.grid.lockAspectLabel')}
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
              onChange={(e) => handleGridWidthChange(e.target.value)}
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
              onChange={(e) => handleGridHeightChange(e.target.value)}
              aria-label={t('sceneEditor.grid.heightLabel')}
            />
          </label>
          <button type="submit" className={styles.saveBtn}>
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
      {battlemapOpen && (
        <GenerateBattlemapModal
          roomId={roomId}
          sceneId={sceneId}
          onClose={() => setBattlemapOpen(false)}
        />
      )}
    </aside>
  );
}
