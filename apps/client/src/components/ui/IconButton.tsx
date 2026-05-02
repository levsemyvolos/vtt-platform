import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './IconButton.module.css';

export type IconButtonVariant = 'solid' | 'outline' | 'ghost';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  isActive?: boolean;
  /** Required for accessibility — describes the icon's action. */
  'aria-label': string;
  children: ReactNode;
}

export default function IconButton({
  variant = 'ghost',
  size = 'md',
  isActive = false,
  className,
  type = 'button',
  children,
  ...rest
}: IconButtonProps) {
  const classes = [
    styles.iconBtn,
    styles[`variant-${variant}`],
    styles[`size-${size}`],
    isActive ? styles.active : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={classes}
      aria-pressed={isActive || undefined}
      {...rest}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
