import { useTranslation } from 'react-i18next';

export type AnnotationTool = 'ping' | 'draw' | 'measure';

interface Props {
  activeTool: AnnotationTool;
  onChange: (tool: AnnotationTool) => void;
}

/**
 * Annotation toolbar overlaid at the top-right of GameCanvas.
 *
 * Ping (Ф3.4.1) — active by default; emits annotation:ping on Stage click.
 * Draw (Ф3.4.2) and Measure (Ф3.4.3) — closed, deferred to roadmap R3b.
 */
export default function AnnotationToolbar({ activeTool, onChange }: Props): JSX.Element {
  const { t } = useTranslation('room');
  return (
    <div className="annotation-toolbar">
      <button
        className={`annotation-btn${activeTool === 'ping' ? ' active' : ''}`}
        onClick={() => onChange('ping')}
        title={t('annotation.pingTitle')}
        aria-pressed={activeTool === 'ping'}
      >
        ⊕ Ping
      </button>
      <button
        className="annotation-btn"
        disabled
        title={t('annotation.drawTitle')}
      >
        ✏ Draw
      </button>
      <button
        className="annotation-btn"
        disabled
        title={t('annotation.measureTitle')}
      >
        📐 Measure
      </button>
    </div>
  );
}
