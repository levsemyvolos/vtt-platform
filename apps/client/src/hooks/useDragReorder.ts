import { useRef, useState } from 'react';

/**
 * Generic HTML5 drag-and-drop reorder hook.
 *
 * Returns event handlers to attach to each draggable item.
 * The `onReorder` callback fires with the new order array when a drop completes.
 */
export function useDragReorder<T>(
  items: T[],
  getKey: (item: T) => string,
  onReorder: (newOrder: T[]) => void,
) {
  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function handleDragStart(index: number) {
    return (e: React.DragEvent) => {
      dragIndex.current = index;
      e.dataTransfer.effectAllowed = 'move';
      // Minimal ghost — browser default is fine.
    };
  }

  function handleDragOver(index: number) {
    return (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragOverIndex !== index) setDragOverIndex(index);
    };
  }

  function handleDrop(index: number) {
    return (e: React.DragEvent) => {
      e.preventDefault();
      const from = dragIndex.current;
      if (from === null || from === index) {
        setDragOverIndex(null);
        return;
      }
      const next = [...items];
      const spliced = next.splice(from, 1);
      const moved = spliced[0];
      if (moved === undefined) {
        setDragOverIndex(null);
        return;
      }
      next.splice(index, 0, moved);
      onReorder(next);
      dragIndex.current = null;
      setDragOverIndex(null);
    };
  }

  function handleDragEnd() {
    dragIndex.current = null;
    setDragOverIndex(null);
  }

  return {
    dragOverIndex,
    getItemProps: (index: number) => ({
      draggable: true as const,
      onDragStart: handleDragStart(index),
      onDragOver: handleDragOver(index),
      onDrop: handleDrop(index),
      onDragEnd: handleDragEnd,
    }),
    /** CSS class helper — apply a "dragging-over" style when index matches. */
    isDragOver: (index: number) => dragOverIndex === index,
  };
}
