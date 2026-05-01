import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { clearFogMask } from '../../store/scene';
import { apiPatchScene } from '../../api/scenes';
import ImageUpload from '../AssetUpload/ImageUpload';
import AssetPicker from '../AssetPicker/AssetPicker';
import GenerateBackgroundModal from '../AIGenerate/GenerateBackgroundModal';
import AddTokenButton from '../GameCanvas/AddTokenButton';
import styles from './EditorToolbarLeft.module.css';

interface EditorToolbarLeftProps {
  roomId: string;
  sceneId: string;
}

export default function EditorToolbarLeft({ roomId, sceneId }: EditorToolbarLeftProps): JSX.Element {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('room');
  const scene = useAppSelector((s) => s.scene.current);
  const tokens = scene?.tokens ?? [];

  const [aiOpen, setAiOpen] = useState(false);
  const [gridSize, setGridSize] = useState(String(scene?.gridSize ?? 50));
  const [gridWidth, setGridWidth] = useState(String(scene?.gridWidth ?? 20));
  const [gridHeight, setGridHeight] = useState(String(scene?.gridHeight ?? 15));
  const [gridSaving, setGridSaving] = useState(false);
  const [gridError, setGridError] = useState<string | null>(null);

  async function handleGridSave(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setGridSaving(true);
    setGridError(null);
    try {
      await apiPatchScene(sceneId, {
        gridSize: Number(gridSize),
        gridWidth: Number(gridWidth),
        gridHeight: Number(gridHeight),
      });
    } catch (err) {
      setGridError(err instanceof Error ? err.message : t('errors:network.saveFailed' as never));
    } finally {
      setGridSaving(false);
    }
  }

  async function handlePickBackground(assetId: string): Promise<void> {
    await apiPatchScene(sceneId, { backgroundAssetId: assetId });
  }

  async function handleUploaded(asset: AssetDTO): Promise<void> {
    await apiPatchScene(sceneId, { backgroundAssetId: asset.id });
  }

  return (
    <aside className={styles.toolbar} aria-label={t('sceneEditor.leftToolbar.label')}>

      <section className={styles.section}>
        <p className={styles.heading}>{t('sceneEditor.leftToolbar.background')}</p>
        <ImageUpload roomId={roomId} onUploaded={(a) => void handleUploaded(a)} />
        <AssetPicker roomId={roomId} onPick={(id) => void handlePickBackground(id)} />
        <button
          type="button"
          className={styles.aiBtn}
          onClick={() => setAiOpen(true)}
        >
          {t('sceneEditor.bg.aiBtn')}
        </button>
      </section>

      <section className={styles.section}>
        <p className={styles.heading}>{t('sceneEditor.leftToolbar.grid')}</p>
        <form onSubmit={(e) => void handleGridSave(e)} className={styles.gridForm}>
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
            <li key={tk.id} className={styles.tokenItem}>{tk.name}</li>
          ))}
        </ul>
        <AddTokenButton myRole="GM" sceneId={sceneId} />
      </section>

      <section className={styles.section}>
        <p className={styles.heading}>{t('sceneEditor.leftToolbar.fog')}</p>
        <button
          type="button"
          className={styles.fogBtn}
          onClick={() => dispatch(clearFogMask())}
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
