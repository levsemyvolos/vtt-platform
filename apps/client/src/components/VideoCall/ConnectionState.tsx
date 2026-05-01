import { Loader2, AlertTriangle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from './ConnectionState.module.css';

const STATE_ICON: Partial<Record<RTCPeerConnectionState, JSX.Element>> = {
  new: <Loader2 size={18} className={styles.spinIcon} />,
  connecting: <Loader2 size={18} className={styles.spinIcon} />,
  disconnected: <AlertTriangle size={18} />,
  failed: <X size={18} />,
  closed: <X size={18} />,
};

const STATE_COLOR: Partial<Record<RTCPeerConnectionState, string>> = {
  new: 'var(--color-text-muted)',
  connecting: 'var(--color-primary)',
  disconnected: 'var(--color-warning)',
  failed: 'var(--color-danger)',
  closed: 'var(--color-danger)',
};

interface ConnectionStateProps {
  state: RTCPeerConnectionState;
}

/** Overlay rendered on top of VideoTile for non-connected states. */
export default function ConnectionState({ state }: ConnectionStateProps): JSX.Element | null {
  const { t } = useTranslation('room');
  if (state === 'connected') return null;

  const icon = STATE_ICON[state] ?? null;
  const labelKey = `connection.${state}` as const;
  const label = t(labelKey, { defaultValue: state });
  const color = STATE_COLOR[state] ?? 'var(--color-text-muted)';

  return (
    <div
      className={styles.overlay}
      data-state={state}
      title={label}
      role="status"
      aria-label={label}
    >
      {icon && (
        <span className={styles.icon} aria-hidden="true" style={{ color }}>
          {icon}
        </span>
      )}
      <span className={styles.label} style={{ color }}>{label}</span>
    </div>
  );
}
