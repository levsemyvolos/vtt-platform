import { useAppSelector } from '../../store';
import styles from './SessionBadge.module.css';

export default function SessionBadge(): JSX.Element | null {
  const title = useAppSelector(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s) => (s as any).room?.currentRoom?.name ?? null,
  );
  if (!title) return null;
  return (
    <span className={styles.badge}>
      <span className={styles.dot} aria-hidden="true" />
      SESSION · {title.toUpperCase()}
    </span>
  );
}
