import { useAppSelector } from '../../store';
import type { Role } from '@vtt/shared';
import type { CanvasTool } from '../../store/canvasViewport';

export interface ImageToolState {
  pendingImageAssetId: string | null;
  pendingImageAssetUrl: string | undefined;
  showImagePicker: boolean;
  showPlacementGhost: boolean;
}

/**
 * Sess 8 + 8.5 — derives image-tool UI state from store.
 *
 * Extracted from GameCanvas to keep the parent component's cyclomatic
 * complexity ≤ 10 (lint gate). Returns:
 *  - pendingImageAssetId / -Url — what was picked but not yet placed
 *  - showImagePicker — render the AssetLibrary modal
 *  - showPlacementGhost — render the cursor-follow preview
 */
export function useImageToolState(myRole: Role, activeTool: CanvasTool): ImageToolState {
  const pendingImageAssetId = useAppSelector((s) => s.canvasViewport.pendingImageAssetId);
  const pendingImageAsset = useAppSelector((s) => (
    pendingImageAssetId ? s.assets.byId[pendingImageAssetId] : undefined
  ));
  const isImageTool = activeTool === 'image';
  const isGM = myRole === 'GM';
  return {
    pendingImageAssetId,
    pendingImageAssetUrl: pendingImageAsset?.url,
    showImagePicker: isImageTool && !pendingImageAssetId && isGM,
    showPlacementGhost: isImageTool && !!pendingImageAssetId && !!pendingImageAsset?.url && isGM,
  };
}
