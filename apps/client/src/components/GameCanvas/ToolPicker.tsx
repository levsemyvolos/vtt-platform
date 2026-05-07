import { useTranslation } from 'react-i18next';
import {
  MousePointer2,
  Hand,
  MapPin,
  Ruler,
  PenTool,
  Eraser,
  Cloud,
  Type,
  Image as ImageIcon,
} from 'lucide-react';
import type { Role } from '@vtt/shared';
import type { CanvasTool } from '../../store/canvasViewport';
import { setActiveTool } from '../../store/canvasViewport';
import { useAppDispatch, useAppSelector } from '../../store';
import { IconButton } from '../ui';

interface ToolDef {
  tool: CanvasTool;
  icon: React.ReactNode;
  gmOnly?: boolean;
}

const ALL_TOOLS: ToolDef[] = [
  { tool: 'select', icon: <MousePointer2 size={16} /> },
  { tool: 'pan',    icon: <Hand size={16} /> },
  { tool: 'ping',   icon: <MapPin size={16} /> },
  { tool: 'ruler',  icon: <Ruler size={16} /> },
  { tool: 'draw',   icon: <PenTool size={16} />,   gmOnly: true },
  { tool: 'eraser', icon: <Eraser size={16} />,    gmOnly: true },
  { tool: 'fog',    icon: <Cloud size={16} />,      gmOnly: true },
  { tool: 'text',   icon: <Type size={16} />,       gmOnly: true },
  { tool: 'image',  icon: <ImageIcon size={16} />,  gmOnly: true },
];

interface ToolPickerProps {
  myRole: Role;
  /** When true, ephemeral tools that broadcast in real-time (e.g. ping) are hidden. */
  hideEphemeral?: boolean;
}

const EPHEMERAL: ReadonlySet<CanvasTool> = new Set(['ping']);

/** Shared row of tool toggle buttons used by both `CanvasToolbar` (play mode) and `SceneEditor` (edit mode). */
export default function ToolPicker({ myRole, hideEphemeral = false }: ToolPickerProps): JSX.Element {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('gameroom');
  const activeTool = useAppSelector((s) => s.canvasViewport.activeTool);
  const labels: Record<CanvasTool, string> = {
    select: t('toolbar.select'),
    pan:    t('toolbar.pan'),
    ping:   t('toolbar.ping'),
    ruler:  t('toolbar.ruler'),
    draw:   t('toolbar.draw'),
    eraser: t('toolbar.eraser'),
    fog:    t('toolbar.fog'),
    text:   t('toolbar.text'),
    image:  t('toolbar.image'),
  };

  const visible = ALL_TOOLS.filter((d) => {
    if (d.gmOnly && myRole !== 'GM') return false;
    if (hideEphemeral && EPHEMERAL.has(d.tool)) return false;
    return true;
  });

  return (
    <>
      {visible.map((def) => (
        <IconButton
          key={def.tool}
          variant="ghost"
          isActive={activeTool === def.tool}
          size="sm"
          aria-label={labels[def.tool]}
          aria-pressed={activeTool === def.tool}
          title={labels[def.tool]}
          onClick={() => dispatch(setActiveTool(def.tool))}
        >
          {def.icon}
        </IconButton>
      ))}
    </>
  );
}
