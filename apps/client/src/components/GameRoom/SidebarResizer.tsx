import { type PointerEvent, type RefObject, useRef } from 'react';
import styles from './SidebarResizer.module.css';

const SIDEBAR_MIN = 280;
const SIDEBAR_MAX = 720;
const SIDEBAR_DEFAULT = 380;
const LS_KEY = 'vtt.sidebarWidth';

interface Props {
  containerRef: RefObject<HTMLDivElement>;
  onResizeEnd: (width: number) => void;
}

export default function SidebarResizer({ containerRef, onResizeEnd }: Props): JSX.Element {
  const dragging = useRef(false);

  function setWidth(w: number): void {
    const clamped = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w));
    containerRef.current?.style.setProperty('--sidebar-w', `${clamped}px`);
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>): void {
    e.preventDefault();
    dragging.current = true;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>): void {
    if (!dragging.current) return;
    const w = window.innerWidth - e.clientX;
    setWidth(w);
  }

  function handlePointerUp(e: PointerEvent<HTMLDivElement>): void {
    if (!dragging.current) return;
    dragging.current = false;
    const w = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, window.innerWidth - e.clientX));
    localStorage.setItem(LS_KEY, String(w));
    onResizeEnd(w);
  }

  function handleDoubleClick(): void {
    setWidth(SIDEBAR_DEFAULT);
    localStorage.setItem(LS_KEY, String(SIDEBAR_DEFAULT));
    onResizeEnd(SIDEBAR_DEFAULT);
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
