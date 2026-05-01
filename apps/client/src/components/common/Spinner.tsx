import styles from './Spinner.module.css';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  /** When true wraps in a centred flex container. */
  centered?: boolean;
  label?: string;
}

/** CSS-only loading spinner. */
export default function Spinner({ size = 'md', centered = false, label = 'Завантаження…' }: SpinnerProps): JSX.Element {
  const cls = `${styles.spinner}${size !== 'md' ? ` ${styles[`spinner--${size}`]}` : ''}`;
  const el = <span role="status" aria-label={label} className={cls} />;
  return centered ? <div className={styles.wrapper}>{el}</div> : el;
}
