import { useCallback, useState, type DragEvent, type RefObject } from 'react';
import type Konva from 'konva';
import type { SceneDTO, Role, AssetDTO } from '@vtt/shared';
import { useAppDispatch, store } from '../../store';
import { uploadAsset } from '../../store/assets';
import { addToast } from '../../store/toast';
import { recordUndo } from '../../store/undoDispatcher';
import { apiAddImageAnnotation } from '../../api/scenes';
import { IMAGE_ALLOWED_MIME, IMAGE_MAX_BYTES, type ImageMime } from '../../api/assets';
import { resolveImageDimensions } from './imageDimensions';

/**
 * Sess 8.6 — drag-and-drop image files onto the canvas.
 *
 * GM-only. On drop the file is validated, uploaded via the existing
 * `uploadAsset` thunk (which also caches the AssetDTO so subsequent UI sees
 * it immediately), then placed via REST `apiAddImageAnnotation` at the drop
 * point with natural aspect ratio. Records an undo entry so Ctrl+Z reverts
 * the placement.
 *
 * Skips Edit Scene mode (the staging buffer there is local-only and Cancel
 * is expected to revert; REST commits would survive Cancel — defer until
 * Sess 9 if needed).
 *
 * Visual feedback: returns `isDraggingFile` so the caller can highlight the
 * canvas border while a file is being dragged over.
 */
export interface CanvasFileDropApi {
  onDragOver: (e: DragEvent<HTMLElement>) => void;
  onDragLeave: (e: DragEvent<HTMLElement>) => void;
  onDrop: (e: DragEvent<HTMLElement>) => void;
  isDraggingFile: boolean;
}

interface Args {
  scene: SceneDTO;
  myRole: Role;
  roomId: string;
  containerRef: RefObject<HTMLDivElement | null>;
  stageRef: RefObject<Konva.Stage | null>;
}

export function useCanvasFileDrop({ scene, myRole, roomId, containerRef, stageRef }: Args): CanvasFileDropApi {
  const dispatch = useAppDispatch();
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const isAllowed = useCallback((): boolean => {
    if (myRole !== 'GM') return false;
    return store.getState().room.editingSceneId === null;
  }, [myRole]);

  const onDragOver = useCallback((e: DragEvent<HTMLElement>): void => {
    if (!isAllowed()) return;
    // Show "copy" cursor + accept the drop. Without preventDefault the browser
    // navigates away (default file-handler).
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDraggingFile(true);
  }, [isAllowed]);

  const onDragLeave = useCallback((e: DragEvent<HTMLElement>): void => {
    // Only stop the highlight when the cursor truly leaves the container —
    // hovering over a child fires dragleave on the parent in Chrome/Firefox.
    if (e.currentTarget === e.target) setIsDraggingFile(false);
  }, []);

  const computeSceneCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const container = containerRef.current;
      const stage = stageRef.current;
      if (!container || !stage) return null;
      const rect = container.getBoundingClientRect();
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;
      const scale = stage.scaleX();
      const pos = stage.position();
      return { x: (localX - pos.x) / scale, y: (localY - pos.y) / scale };
    },
    [containerRef, stageRef],
  );

  const validate = useCallback((file: File): string | null => {
    if (!IMAGE_ALLOWED_MIME.includes(file.type as ImageMime)) {
      return 'Unsupported image type — use PNG, JPEG, or WEBP.';
    }
    if (file.size > IMAGE_MAX_BYTES) {
      return `Image too large — max ${IMAGE_MAX_BYTES / 1024 / 1024} MB.`;
    }
    return null;
  }, []);

  const placeUploadedImage = useCallback(
    async (asset: AssetDTO, sceneCoords: { x: number; y: number }): Promise<void> => {
      const { w, h } = await resolveImageDimensions(asset.url, scene.gridSize);
      const x = Math.round(sceneCoords.x - w / 2);
      const y = Math.round(sceneCoords.y - h / 2);
      const beforeIds = new Set(
        (store.getState().scene.current?.annotations.objects ?? []).map((o) => o.id),
      );
      const result = await apiAddImageAnnotation(scene.id, {
        x, y, assetId: asset.id, width: w, height: h,
      });
      const newObj = (result.objects ?? []).find(
        (o) => !beforeIds.has(o.id) && o.type === 'image',
      );
      if (newObj) recordUndo({ kind: 'object_add', object: newObj });
    },
    [scene.gridSize, scene.id],
  );

  const uploadAndPlace = useCallback(
    async (file: File, sceneCoords: { x: number; y: number }): Promise<void> => {
      const err = validate(file);
      if (err) {
        dispatch(addToast('error', err));
        return;
      }
      try {
        const asset = await dispatch(uploadAsset({ roomId, file })).unwrap();
        await placeUploadedImage(asset, sceneCoords);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Upload failed.';
        dispatch(addToast('error', msg));
      }
    },
    [dispatch, placeUploadedImage, roomId, validate],
  );

  const onDrop = useCallback((e: DragEvent<HTMLElement>): void => {
    if (!isAllowed()) return;
    e.preventDefault();
    setIsDraggingFile(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length === 0) return;
    const dropCoords = computeSceneCoords(e.clientX, e.clientY);
    if (!dropCoords) return;
    // Multi-file: cascade with a small offset so they don't stack exactly on
    // top of each other.
    files.forEach((file, i) => {
      const offset = i * 24;
      void uploadAndPlace(file, { x: dropCoords.x + offset, y: dropCoords.y + offset });
    });
  }, [computeSceneCoords, isAllowed, uploadAndPlace]);

  return { onDragOver, onDragLeave, onDrop, isDraggingFile };
}
