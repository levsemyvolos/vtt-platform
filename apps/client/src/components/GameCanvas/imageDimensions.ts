/**
 * Sess 8 — image-add natural-proportions helpers.
 *
 * Loads an image's natural dimensions via the browser's `<img>` API and clamps
 * them to fit within scene bounds. Used by every image-placement entry point
 * (scene editor "Add to scene" + the canvas image tool) so newly-placed images
 * preserve their aspect ratio instead of defaulting to a square crop.
 *
 * No DB migration required — Asset rows don't store width/height yet (a future
 * Sess could add them and skip the live load). For now we cache results in
 * a module-level Map so repeated picks of the same asset within one session
 * avoid the network round-trip.
 */

/** Largest dimension a freshly-placed image may take (clamps natural size).
 *  Picked as a balance between visual fidelity and not dominating the scene. */
export const MAX_INITIAL_DIMENSION = 1024;

interface NaturalSize {
  w: number;
  h: number;
}

const cache = new Map<string, NaturalSize>();

/** Loads natural width/height of an image URL. Returns null on load failure. */
export async function loadImageNaturalSize(url: string): Promise<NaturalSize | null> {
  const cached = cache.get(url);
  if (cached) return cached;
  const img = new window.Image();
  img.crossOrigin = 'anonymous';
  const loaded = await new Promise<boolean>((resolve) => {
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
  if (!loaded || img.naturalWidth === 0) return null;
  const size = { w: img.naturalWidth, h: img.naturalHeight };
  cache.set(url, size);
  return size;
}

/** Computes initial scene-placement dimensions for an image while preserving
 *  aspect ratio. Caps the longest side at MAX_INITIAL_DIMENSION and floors the
 *  shortest side at gridSize (1 cell) so the image is never invisible.
 *
 *  Falls back to a square `min(MAX_INITIAL_DIMENSION, 4 * gridSize)` when
 *  natural dimensions can't be determined (network error / CORS) — keeps
 *  the place flow usable without surfacing the error. */
export function computeInitialImageDimensions(
  natural: NaturalSize | null,
  gridSize: number,
): NaturalSize {
  const minDim = gridSize;
  if (!natural) {
    const fallback = Math.min(MAX_INITIAL_DIMENSION, gridSize * 4);
    return { w: fallback, h: fallback };
  }
  const longest = Math.max(natural.w, natural.h);
  if (longest <= MAX_INITIAL_DIMENSION) {
    return {
      w: Math.max(minDim, Math.round(natural.w)),
      h: Math.max(minDim, Math.round(natural.h)),
    };
  }
  const scale = MAX_INITIAL_DIMENSION / longest;
  return {
    w: Math.max(minDim, Math.round(natural.w * scale)),
    h: Math.max(minDim, Math.round(natural.h * scale)),
  };
}

/** One-shot helper for callers that just want final dimensions from an asset URL. */
export async function resolveImageDimensions(
  url: string,
  gridSize: number,
): Promise<NaturalSize> {
  const natural = await loadImageNaturalSize(url);
  return computeInitialImageDimensions(natural, gridSize);
}
