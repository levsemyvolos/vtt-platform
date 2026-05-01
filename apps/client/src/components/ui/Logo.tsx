import type { SVGProps } from 'react';

export interface LogoProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number;
  withDot?: boolean;
}

/**
 * Знак-ромб без wordmark — як у legacy SVG мокапах.
 * Використовує --color-primary через currentColor.
 */
export default function Logo({ size = 24, withDot = true, ...rest }: LogoProps) {
  const stroke = 1.5;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinejoin="round"
      role="img"
      aria-label="Logo"
      style={{ color: 'var(--color-primary)' }}
      {...rest}
    >
      <polygon points="12,2 22,12 12,22 2,12" />
      {withDot && <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />}
    </svg>
  );
}
