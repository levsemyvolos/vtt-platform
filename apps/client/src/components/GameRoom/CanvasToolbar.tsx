import { useTranslation } from 'react-i18next';
import {
  Music,
  Sparkles,
  PencilRuler,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';
import type { Role } from '@vtt/shared';
import { zoomIn, zoomOut, fit, setZoom } from '../../store/canvasViewport';
import { startEditing } from '../../store/room';
import { useAppDispatch, useAppSelector } from '../../store';
import { IconButton } from '../ui';
import ToolPicker from '../GameCanvas/ToolPicker';
import type { SidebarTab } from './types';
import styles from './CanvasToolbar.module.css';

interface CanvasToolbarProps {
  myRole: Role;
  onOpenTab: (tab: SidebarTab) => void;
  onOpenAssistant: () => void;
}

export default function CanvasToolbar({
  myRole,
  onOpenTab,
  onOpenAssistant,
}: CanvasToolbarProps): JSX.Element {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('gameroom');
  const zoom = useAppSelector((s) => s.canvasViewport.zoom);
  const currentSceneId = useAppSelector((s) => s.scene.current?.id ?? null);

  const zoomPct = `${Math.round(zoom * 100)}%`;

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Canvas tools">
      <div className={styles.tools}>
        <ToolPicker myRole={myRole} />

        <span className={styles.divider} aria-hidden />

        <IconButton
          variant="ghost"
          size="sm"
          aria-label={t('toolbar.music')}
          title={t('toolbar.music')}
          onClick={() => onOpenTab('audio')}
        >
          <Music size={16} />
        </IconButton>

        {myRole === 'GM' && (
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={t('toolbar.ai')}
            title={t('toolbar.ai')}
            onClick={onOpenAssistant}
          >
            <Sparkles size={16} />
          </IconButton>
        )}

        {myRole === 'GM' && currentSceneId && (
          <>
            <span className={styles.divider} aria-hidden />
            <IconButton
              variant="ghost"
              size="sm"
              aria-label={t('topBar.editScene')}
              title={t('topBar.editScene')}
              onClick={() => { dispatch(startEditing(currentSceneId)); }}
            >
              <PencilRuler size={16} />
            </IconButton>
          </>
        )}
      </div>

      <div className={styles.zoom}>
        <IconButton
          variant="ghost"
          size="sm"
          aria-label={t('toolbar.zoomOut')}
          title={t('toolbar.zoomOut')}
          onClick={() => dispatch(zoomOut())}
        >
          <ZoomOut size={14} />
        </IconButton>

        <button
          type="button"
          className={styles.zoomPct}
          onClick={() => dispatch(setZoom(1))}
          title={t('toolbar.zoomReset')}
          aria-label={t('toolbar.zoomReset')}
        >
          {zoomPct}
        </button>

        <IconButton
          variant="ghost"
          size="sm"
          aria-label={t('toolbar.zoomIn')}
          title={t('toolbar.zoomIn')}
          onClick={() => dispatch(zoomIn())}
        >
          <ZoomIn size={14} />
        </IconButton>

        <IconButton
          variant="ghost"
          size="sm"
          aria-label={t('toolbar.zoomFit')}
          title={t('toolbar.zoomFit')}
          onClick={() => dispatch(fit())}
        >
          <Maximize2 size={14} />
        </IconButton>
      </div>
    </div>
  );
}
