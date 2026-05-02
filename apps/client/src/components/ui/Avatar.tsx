import type { HTMLAttributes } from 'react';
import styles from './Avatar.module.css';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';
export type AvatarStatus = 'online' | 'offline' | 'busy' | 'idle';

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  /** Source URL of the avatar image. */
  src?: string;
  /** Alt text or fallback name (initials are extracted). */
  name: string;
  size?: AvatarSize;
  status?: AvatarStatus;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export default function Avatar({
  src,
  name,
  size = 'md',
  status,
  className,
  ...rest
}: AvatarProps) {
  const cls = [
    styles.avatar,
    styles[`size-${size}`],
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={cls} aria-label={name} role="img" {...rest}>
      {src ? (
        <img className={styles.img} src={src} alt={name} />
      ) : (
        <span className={styles.initials} aria-hidden="true">{initials(name)}</span>
      )}
      {status && <span className={`${styles.statusDot} ${styles[`status-${status}`]}`} aria-hidden="true" />}
    </span>
  );
}
