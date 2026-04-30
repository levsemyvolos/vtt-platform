const STATE_ICON: Partial<Record<RTCPeerConnectionState, string>> = {
  new: '⏳',
  connecting: '⏳',
  disconnected: '⚠',
  failed: '✗',
  closed: '✗',
};

const STATE_LABEL: Partial<Record<RTCPeerConnectionState, string>> = {
  new: 'Ініціалізація',
  connecting: "З'єднання...",
  disconnected: 'Відключено',
  failed: 'Помилка з\'єднання',
  closed: 'Закрито',
};

interface ConnectionStateProps {
  state: RTCPeerConnectionState;
}

/** Overlay rendered on top of VideoTile for non-connected states. */
export default function ConnectionState({ state }: ConnectionStateProps): JSX.Element | null {
  if (state === 'connected') return null;
  const icon = STATE_ICON[state] ?? '?';
  const label = STATE_LABEL[state] ?? state;
  return (
    <div className="connection-state" data-state={state} title={label} role="status" aria-label={label}>
      <span className="connection-state__icon" aria-hidden="true">{icon}</span>
      <span className="connection-state__label">{label}</span>
    </div>
  );
}
