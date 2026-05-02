import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

export type CardAccent =
  | 'none'
  | 'dnd'
  | 'homebrew'
  | 'coc'
  | 'pathfinder'
  | 'invitation';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional category-bar at the top (or border for invitation). */
  accent?: CardAccent;
  /** Dashed border — used by CreateRoomCard and Empty States. */
  dashed?: boolean;
  /** Hover lift (interactive card). */
  interactive?: boolean;
  children: ReactNode;
}

export default function Card({
  accent = 'none',
  dashed = false,
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  const classes = [
    styles.card,
    accent !== 'none' ? styles[`accent-${accent}`] : '',
    dashed ? styles.dashed : '',
    interactive ? styles.interactive : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
