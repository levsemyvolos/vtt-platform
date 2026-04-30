import { useEffect, useState } from 'react';

/**
 * Loads a bitmap into an `HTMLImageElement` so it can be passed to a Konva
 * `<Image>` node. Returns `null` while loading or on error so the caller can
 * render a placeholder. Re-runs when `src` changes; cleans up by detaching
 * the load handler before swap-out.
 */
export function useImage(src: string | undefined): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    let cancelled = false;
    img.onload = () => {
      if (!cancelled) setImage(img);
    };
    img.onerror = () => {
      if (!cancelled) setImage(null);
    };
    img.src = src;
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  return image;
}
