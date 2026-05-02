import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeVariant =
  | 'gold'        // primary accent (GM badge у TopBar, "+ Створити")
  | 'role'        // role chips (GM/Player/Observer)
  | 'status'      // STABLE / JITTER / OFFLINE (success/warning/danger)
  | 'category'    // game-system tag bar (D&D 5e · АКТИВНА)
  | 'neutral';    // default light surface chip

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'muted';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** For status variant — chooses semantic color. */
  tone?: BadgeTone;
  /** Render as eyebrow-style uppercase. */
  uppercase?: boolean;
  children: ReactNode;
}

export default function Badge({
  variant = 'neutral',
  tone = 'muted',
  uppercase = false,
  className,
  children,
  ...rest
}: BadgeProps) {
  const classes = [
    styles.badge,
    styles[`variant-${variant}`],
    variant === 'status' ? styles[`tone-${tone}`] : '',
    uppercase ? styles.uppercase : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}
