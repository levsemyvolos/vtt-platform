import sharp from 'sharp';

/**
 * Applies a circular alpha mask to an image, returning a PNG with a
 * transparent background outside the inscribed circle.
 *
 * Algorithm:
 *  1. Square-crop to the shorter dimension (center-anchored).
 *  2. Composite an SVG circle as a dest-in mask (keeps only the circle area).
 *  3. Output as PNG (required for alpha channel).
 */
export async function circleClipPng(bytes: Buffer): Promise<Buffer> {
  const image = sharp(bytes);
  const { width = 0, height = 0 } = await image.metadata();
  const size = Math.min(width, height);
  const r = size / 2;

  const svgMask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<circle cx="${r}" cy="${r}" r="${r}" fill="white"/>` +
    `</svg>`,
  );

  return sharp(bytes)
    .resize(size, size, { position: 'centre' })
    .composite([{ input: svgMask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}
