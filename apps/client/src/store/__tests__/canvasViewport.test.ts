import { describe, it, expect } from 'vitest';
import canvasViewportReducer, {
  setZoom,
  zoomIn,
  zoomOut,
  center,
  fit,
  setActiveTool,
  resetTool,
} from '../canvasViewport';
import type { CanvasTool } from '../canvasViewport';

function init() {
  return canvasViewportReducer(undefined, { type: '@@INIT' });
}

describe('canvasViewport slice', () => {
  it('initial state is zoom=1 activeTool=select', () => {
    const s = init();
    expect(s.zoom).toBe(1);
    expect(s.activeTool).toBe('select');
  });

  it('setZoom clamps to [0.25, 4]', () => {
    const s1 = canvasViewportReducer(init(), setZoom(0.1));
    expect(s1.zoom).toBe(0.25);
    const s2 = canvasViewportReducer(init(), setZoom(10));
    expect(s2.zoom).toBe(4);
    const s3 = canvasViewportReducer(init(), setZoom(2));
    expect(s3.zoom).toBe(2);
  });

  it('zoomIn multiplies zoom by 1.25', () => {
    const s = canvasViewportReducer(init(), zoomIn());
    expect(s.zoom).toBeCloseTo(1.25, 2);
  });

  it('zoomOut divides zoom by 1.25', () => {
    const s = canvasViewportReducer(init(), zoomOut());
    expect(s.zoom).toBeCloseTo(0.8, 2);
  });

  it('center resets zoom to 1', () => {
    const base = canvasViewportReducer(init(), setZoom(2));
    const s = canvasViewportReducer(base, center());
    expect(s.zoom).toBe(1);
  });

  it('fit resets zoom to 1', () => {
    const base = canvasViewportReducer(init(), setZoom(3));
    const s = canvasViewportReducer(base, fit());
    expect(s.zoom).toBe(1);
  });

  it('setActiveTool changes active tool', () => {
    const tools: CanvasTool[] = ['select', 'ping', 'ruler', 'draw', 'fog', 'text', 'image'];
    for (const tool of tools) {
      const s = canvasViewportReducer(init(), setActiveTool(tool));
      expect(s.activeTool).toBe(tool);
    }
  });

  it('resetTool returns to select', () => {
    const base = canvasViewportReducer(init(), setActiveTool('fog'));
    const s = canvasViewportReducer(base, resetTool());
    expect(s.activeTool).toBe('select');
  });
});
