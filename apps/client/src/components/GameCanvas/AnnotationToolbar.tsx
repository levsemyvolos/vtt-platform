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
  return (
    <div className="annotation-toolbar">
      <button
        className={`annotation-btn${activeTool === 'ping' ? ' active' : ''}`}
        onClick={() => onChange('ping')}
        title="Ping — привернути увагу (Ф3.4.1)"
        aria-pressed={activeTool === 'ping'}
      >
        ⊕ Ping
      </button>
      <button
        className="annotation-btn"
        disabled
        title="Малювання — TODO R3b (Ф3.4.2)"
      >
        ✏ Draw
      </button>
      <button
        className="annotation-btn"
        disabled
        title="Лінійка — TODO R3b (Ф3.4.3)"
      >
        📐 Measure
      </button>
    </div>
  );
}
