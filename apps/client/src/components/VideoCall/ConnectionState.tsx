import { useTranslation } from 'react-i18next';

const STATE_ICON: Partial<Record<RTCPeerConnectionState, string>> = {
  new: '⏳',
  connecting: '⏳',
  disconnected: '⚠',
  failed: '✗',
  closed: '✗',
};

interface ConnectionStateProps {
  state: RTCPeerConnectionState;
}

/** Overlay rendered on top of VideoTile for non-connected states. */
export default function ConnectionState({ state }: ConnectionStateProps): JSX.Element | null {
  const { t } = useTranslation('room');
  if (state === 'connected') return null;

  const icon = STATE_ICON[state] ?? '?';
  const labelKey = `connection.${state}` as const;
  const label = t(labelKey, { defaultValue: state });

  return (
    <div className="connection-state" data-state={state} title={label} role="status" aria-label={label}>
      <span className="connection-state__icon" aria-hidden="true">{icon}</span>
      <span className="connection-state__label">{label}</span>
    </div>
  );
}
