import { type PointerEvent, type RefObject, useRef } from 'react';
import styles from './DialogListResizer.module.css';

const PANEL_MIN = 160;
const PANEL_MAX = 400;
const PANEL_DEFAULT = 240;
const LS_KEY = 'vtt.assistantDialogListWidth';

interface Props {
  containerRef: RefObject<HTMLDivElement>;
  onResizeEnd?: (width: number) => void;
}

export default function DialogListResizer({ containerRef, onResizeEnd }: Props): JSX.Element {
  const dragging = useRef(false);

  function setWidth(w: number): void {
    const clamped = Math.min(PANEL_MAX, Math.max(PANEL_MIN, w));
    containerRef.current?.style.setProperty('--dialog-list-w', `${clamped}px`);
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>): void {
    e.preventDefault();
    dragging.current = true;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>): void {
    if (!dragging.current) return;
    const left = containerRef.current?.getBoundingClientRect().left ?? 0;
    const w = e.clientX - left;
    setWidth(w);
  }

  function handlePointerUp(e: PointerEvent<HTMLDivElement>): void {
    if (!dragging.current) return;
    dragging.current = false;
    const left = containerRef.current?.getBoundingClientRect().left ?? 0;
    const clamped = Math.min(PANEL_MAX, Math.max(PANEL_MIN, e.clientX - left));
    localStorage.setItem(LS_KEY, String(clamped));
    onResizeEnd?.(clamped);
  }

  function handleDoubleClick(): void {
    setWidth(PANEL_DEFAULT);
    localStorage.setItem(LS_KEY, String(PANEL_DEFAULT));
    onResizeEnd?.(PANEL_DEFAULT);
  }

  return (
    <div
      className={styles.resizer}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      aria-hidden
    />
  );
}
