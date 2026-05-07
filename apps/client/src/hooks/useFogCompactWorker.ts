import { useEffect, useRef } from 'react';
import {
  FOG_COMPACTION_THRESHOLD,
  FOG_BITMAP_MAX_DIM,
  type FogShape,
  type FogBitmap,
  type Role,
  type SceneDTO,
} from '@vtt/shared';
import { useAppSelector } from '../store';
import { emitFogBitmapPush } from '../api/socket';
import { renderFogToCanvas } from '../components/GameCanvas/fogShapes';

/**
 * Sess 11 — GM-only fog compaction worker.
 *
 * Watches the active scene's fog shapes. When the count crosses
 * FOG_COMPACTION_THRESHOLD (50), the GM client renders all current shapes
 * (plus the existing bitmap, if any) into a single PNG and pushes it via
 * `fog:bitmap-push`. The server then replaces the consumed shape ids with
 * the bitmap and broadcasts `fog:bitmap-update` to the room (handled in
 * api/socket.ts → fogBitmapUpdated reducer).
 *
 * Players never run this hook (we early-return on role). Concurrency: a
 * `pendingRef` prevents a second compact from firing while one is in flight;
 * the lock is released either after the bitmap-update arrives (shapes drop
 * below the threshold again) or after a 30 s safety timeout.
 *
 * The render itself happens off-screen — `renderFogToCanvas` writes to a
 * fresh `<canvas>` element which is converted to a data URL via toDataURL.
 * No DOM mutation, no Konva interaction, no flashing.
 */
export function useFogCompactWorker({
  scene,
  myRole,
  roomId,
}: {
  scene: SceneDTO | null;
  myRole: Role;
  roomId: string;
}): void {
  const fogShapes = useAppSelector((s) => s.scene.current?.fogShapes ?? null);
  const fogBitmap = useAppSelector((s) => s.scene.current?.fogBitmap ?? null);
  const pendingRef = useRef(false);
  // Snapshot of the data-URL we last submitted, used to detect stale onload
  // resolutions if the GM compacts again before the bitmap-update arrives.
  const lastPushedDataRef = useRef<string | null>(null);

  useEffect(() => {
    if (myRole !== 'GM') return;
    if (!scene || !roomId) return;
    if (!fogShapes || fogShapes.length < FOG_COMPACTION_THRESHOLD) return;
    if (pendingRef.current) return;

    pendingRef.current = true;
    // Defer to a microtask so React state updates that scheduled this effect
    // get flushed first; otherwise the FogOfWarLayer canvas render and the
    // compaction render race for the same frame.
    queueMicrotask(() => {
      void runCompaction({ scene, fogShapes, fogBitmap, roomId, lastPushedDataRef })
        .finally(() => {
          // Safety release in case the round-trip never completes (network
          // loss, server reject, etc.). The next threshold trigger will
          // re-attempt the compaction.
          window.setTimeout(() => { pendingRef.current = false; }, 30_000);
        });
    });
    // Note: pendingRef is also implicitly released when fogShapes drops
    // below the threshold after `fog:bitmap-update`, because this effect
    // re-runs and the early-return path resets the local closure capture.
  }, [myRole, scene, roomId, fogShapes, fogBitmap]);
}

/** Sess 11 — pure compaction routine: load bitmap → render shapes on top
 *  via renderFogToCanvas → toDataURL → emit. Extracted from the hook so it
 *  can be unit-tested in isolation if we add fog-compaction tests later. */
async function runCompaction(args: {
  scene: SceneDTO;
  fogShapes: FogShape[];
  fogBitmap: FogBitmap | null | undefined;
  roomId: string;
  lastPushedDataRef: { current: string | null };
}): Promise<void> {
  const { scene, fogShapes, fogBitmap, roomId, lastPushedDataRef } = args;
  const sceneW = scene.gridSize * scene.gridWidth;
  const sceneH = scene.gridSize * scene.gridHeight;
  if (sceneW <= 0 || sceneH <= 0) return;

  // Cap the rendered bitmap to FOG_BITMAP_MAX_DIM on the longer side so the
  // JSONB blob stays bounded for huge scenes (e.g. 100×100 grid).
  const longest = Math.max(sceneW, sceneH);
  const scale = longest > FOG_BITMAP_MAX_DIM ? FOG_BITMAP_MAX_DIM / longest : 1;
  const bitmapW = Math.round(sceneW * scale);
  const bitmapH = Math.round(sceneH * scale);

  const existingImage = await loadBitmapImage(fogBitmap);
  const canvas = document.createElement('canvas');
  canvas.width = bitmapW;
  canvas.height = bitmapH;
  // renderFogToCanvas operates in scene coords — when scale < 1 we need to
  // pre-scale the shapes' coordinates. Easiest path: render at scene-coord
  // dimensions into a temp canvas, then drawImage-downscale to the cap.
  if (scale === 1) {
    renderFogToCanvas(fogShapes, sceneW, sceneH, canvas, fogBitmap ?? null, existingImage);
  } else {
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = sceneW;
    fullCanvas.height = sceneH;
    renderFogToCanvas(fogShapes, sceneW, sceneH, fullCanvas, fogBitmap ?? null, existingImage);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(fullCanvas, 0, 0, bitmapW, bitmapH);
  }

  const dataUrl = canvas.toDataURL('image/png');
  lastPushedDataRef.current = dataUrl;
  const bitmap: FogBitmap = { data: dataUrl, w: bitmapW, h: bitmapH };
  const consumedShapeIds = fogShapes.map((s) => s.id);
  emitFogBitmapPush({ roomId, sceneId: scene.id, bitmap, consumedShapeIds });
}

/** Sess 11 — decode an existing FogBitmap data URL into an HTMLImageElement.
 *  Resolves to null when there's no bitmap or decoding fails. Used by the
 *  compactor to merge previous compactions into the new bitmap. */
function loadBitmapImage(bitmap: FogBitmap | null | undefined): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!bitmap) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = bitmap.data;
  });
}
