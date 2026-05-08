import type { SVGProps } from 'react';

export interface LogoProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number;
  /** @deprecated unused, kept for backwards compatibility */
  withDot?: boolean;
}

/**
 * Typographic "VTT" logo mark.
 * Uses currentColor so it adapts to light/dark themes via CSS variable --color-primary.
 *
 * Design: bold condensed "VTT" letterform rendered as inline SVG paths.
 * Variant A — typographic (no geometric dice shapes to avoid Roll20 trademark similarity).
 */
export default function Logo({ size = 24, ...rest }: LogoProps) {
  // Scale factor: base design is 56×24 viewBox, scale to requested size preserving aspect ratio
  const width = Math.round(size * (56 / 24));
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={size}
      viewBox="0 0 56 24"
      fill="currentColor"
      stroke="none"
      role="img"
      aria-label="VTT Logo"
      style={{ color: 'var(--color-primary)' }}
      {...rest}
    >
      {/* V — bold condensed letterform */}
      <path d="M0 2 L4 2 L9 16 L14 2 L18 2 L11 22 L7 22 Z" />
      {/* T (first) — bold condensed letterform */}
      <path d="M20 2 L36 2 L36 6 L30 6 L30 22 L26 22 L26 6 L20 6 Z" />
      {/* T (second) — bold condensed letterform */}
      <path d="M38 2 L54 2 L54 6 L48 6 L48 22 L44 22 L44 6 L38 6 Z" />
    </svg>
  );
}
