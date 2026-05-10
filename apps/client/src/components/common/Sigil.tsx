/**
 * Shared manuscript sigil — geometric glyph used in CharacterSheetOverlay
 * and AssistantPanel headers. Two glyph variants:
 *   - "shield" (default): vault crest, used on the character sheet
 *   - "compass": double-ellipse, used on the GM AI Toolkit
 *
 * Renders inline (currentColor + var(--rune)) so it picks up the surrounding
 * theme without CSS coupling.
 */

interface SigilProps {
  variant?: 'shield' | 'compass';
  size?: number;
  className?: string;
}

export default function Sigil({
  variant = 'shield',
  size,
  className,
}: SigilProps): JSX.Element {
  const styleProps = size !== undefined ? { width: size, height: size } : undefined;

  if (variant === 'compass') {
    return (
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className={className}
        {...(styleProps ? { style: styleProps } : {})}
      >
        <ellipse cx="16" cy="16" rx="12" ry="6" fill="none" stroke="currentColor" strokeWidth="0.8" />
        <ellipse cx="16" cy="16" rx="6" ry="12" fill="none" stroke="currentColor" strokeWidth="0.8" />
        <circle cx="16" cy="16" r="2.4" fill="var(--rune)" />
        <circle cx="16" cy="16" r="3.6" fill="none" stroke="var(--rune)" strokeWidth="0.6" opacity=".5" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 22 22"
      aria-hidden="true"
      className={className}
      {...(styleProps ? { style: styleProps } : {})}
    >
      <path
        d="M11 2 L19 6 V12 C19 16 15 19 11 20 C7 19 3 16 3 12 V6 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.8"
      />
      <path
        d="M11 5 L11 17 M6 11 L16 11"
        stroke="currentColor"
        strokeWidth="0.6"
        opacity=".5"
      />
      <circle cx="11" cy="11" r="2" fill="var(--rune)" />
    </svg>
  );
}
