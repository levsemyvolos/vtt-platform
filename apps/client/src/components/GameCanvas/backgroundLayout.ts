import type { BackgroundFit } from '@vtt/shared';

export interface BackgroundGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Compute Konva <Image> geometry for a scene background.
 *
 * Inputs: natural image size, scene canvas size (gridWidth*gridSize ×
 * gridHeight*gridSize), fit mode, manual offset and scale.
 *
 * Algorithm:
 *  1. base size by fit mode:
 *     - 'stretch' → exactly scene size
 *     - 'cover'   → max scale that fully covers the scene (may overflow)
 *     - 'contain' → max scale that fits inside the scene (may letterbox)
 *  2. multiply by manual `scale`.
 *  3. center the result inside the scene rect, then add manual offset.
 *
 * If natural size is unknown (image still loading), fall back to scene
 * dimensions so the placeholder rect doesn't jump on load.
 */
export function computeBackgroundGeometry(args: {
  naturalWidth: number;
  naturalHeight: number;
  sceneWidth: number;
  sceneHeight: number;
  fit: BackgroundFit;
  scale: number;
  offsetX: number;
  offsetY: number;
}): BackgroundGeometry {
  const { naturalWidth, naturalHeight, sceneWidth, sceneHeight, fit, scale, offsetX, offsetY } = args;

  let baseW = sceneWidth;
  let baseH = sceneHeight;

  if (naturalWidth > 0 && naturalHeight > 0) {
    const sceneAspect = sceneWidth / sceneHeight;
    const imageAspect = naturalWidth / naturalHeight;

    if (fit === 'cover') {
      // Fill so neither dimension is smaller than the scene.
      if (imageAspect > sceneAspect) {
        baseH = sceneHeight;
        baseW = sceneHeight * imageAspect;
      } else {
        baseW = sceneWidth;
        baseH = sceneWidth / imageAspect;
      }
    } else if (fit === 'contain') {
      // Letterbox so neither dimension exceeds the scene.
      if (imageAspect > sceneAspect) {
        baseW = sceneWidth;
        baseH = sceneWidth / imageAspect;
      } else {
        baseH = sceneHeight;
        baseW = sceneHeight * imageAspect;
      }
    } else /* stretch */ {
      baseW = sceneWidth;
      baseH = sceneHeight;
    }
  }

  const finalW = baseW * scale;
  const finalH = baseH * scale;
  // Center the image in the scene, then apply manual offset.
  const x = (sceneWidth - finalW) / 2 + offsetX;
  const y = (sceneHeight - finalH) / 2 + offsetY;

  return { x, y, width: finalW, height: finalH };
}
