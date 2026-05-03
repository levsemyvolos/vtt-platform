import type { SVGProps } from 'react';

export interface LogoProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number;
  /** @deprecated unused, kept for backwards compatibility */
  withDot?: boolean;
}

/**
 * D20-inspired logo mark.
 * Uses currentColor (--color-primary via inline style) so it adapts to both
 * light and dark themes without any JavaScript.
 *
 * Geometry: simplified icosahedron face projection — top pentagon fan + bottom strip.
 */
export default function Logo({ size = 24, withDot: _withDot, ...rest }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
      strokeLinecap="round"
      role="img"
      aria-label="VTT Logo"
      style={{ color: 'var(--color-primary)' }}
      {...rest}
    >
      {/* Outer pentagon (top half of D20) */}
      <polygon points="12,2 21,8.5 17.5,19 6.5,19 3,8.5" />
      {/* Inner triangle — "20" face */}
      <polygon points="12,5.5 18.5,10 15,17 9,17 5.5,10" opacity="0.35" fill="currentColor" stroke="none" />
      {/* Top cap line */}
      <line x1="12" y1="2" x2="12" y2="5.5" />
      {/* Left diagonal */}
      <line x1="3" y1="8.5" x2="5.5" y2="10" />
      {/* Right diagonal */}
      <line x1="21" y1="8.5" x2="18.5" y2="10" />
      {/* Bottom left */}
      <line x1="6.5" y1="19" x2="9" y2="17" />
      {/* Bottom right */}
      <line x1="17.5" y1="19" x2="15" y2="17" />
      {/* Center "20" dot */}
      <circle cx="12" cy="11.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
