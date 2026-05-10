import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Circle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../store';
import { getSocket } from '../../api/socket';
import styles from './ConnectionPill.module.css';

type StepStatus = 'done' | 'active' | 'error' | 'pending';

interface StepDef {
  key: 'auth' | 'scene' | 'channel';
  label: string;
  status: StepStatus;
}

function StepIcon({ status }: { status: StepStatus }): JSX.Element {
  if (status === 'done') return <Check size={14} strokeWidth={2} aria-hidden="true" />;
  if (status === 'active') return <Loader2 size={14} strokeWidth={2} className={styles.spin} aria-hidden="true" />;
  if (status === 'error') return <AlertCircle size={14} strokeWidth={2} aria-hidden="true" />;
  return <Circle size={10} strokeWidth={2} aria-hidden="true" />;
}

function roomErrorLabel(code: number | null, t: (k: string) => string): string | null {
  if (code === null) return null;
  if (code === 403) return t('lobby.connection.error.403');
  if (code === 404) return t('lobby.connection.error.404');
  if (code === 0) return t('lobby.connection.error.network');
  if (code >= 500) return t('lobby.connection.error.5xx');
  return null;
}

export default function ConnectionPill(): JSX.Element {
  const { t } = useTranslation('room');
  const sessionStatus = useAppSelector((s) => s.session.status);
  const roomStatus = useAppSelector((s) => s.room.status);
  const roomErrorCode = useAppSelector((s) => s.room.roomErrorCode);
  const [socketConnected, setSocketConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    setSocketConnected(socket.connected);
    const onConnect = (): void => setSocketConnected(true);
    const onDisconnect = (): void => setSocketConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const steps: ReadonlyArray<StepDef> = useMemo(() => {
    const authDone = sessionStatus === 'authenticated';
    const roomLoaded = roomStatus === 'loaded';
    const roomError = roomStatus === 'error';

    return [
      {
        key: 'auth',
        label: t('lobby.connection.auth'),
        status: authDone ? 'done' : 'active',
      },
      {
        key: 'scene',
        label: t('lobby.connection.scene'),
        status: roomError ? 'error' : !authDone ? 'pending' : roomLoaded ? 'done' : 'active',
      },
      {
        key: 'channel',
        label: t('lobby.connection.channel'),
        status: roomError ? 'error' : !roomLoaded ? 'pending' : socketConnected ? 'done' : 'active',
      },
    ];
  }, [roomStatus, sessionStatus, socketConnected, t]);

  const allDone = steps.every((step) => step.status === 'done');
  const hasError = steps.some((step) => step.status === 'error');

  return (
    <div
      className={['glass', 'glass-strong', styles.pill].join(' ')}
      role="status"
      aria-label={t('lobby.connection.label')}
    >
      <span className={styles.readyLabel}>
        {allDone && !hasError ? t('lobby.connection.allReady') : t('lobby.connection.diagnostic')}
      </span>
      <span className={styles.steps}>
        {steps.map((step) => {
            const errLabel = step.status === 'error' && step.key === 'scene'
              ? roomErrorLabel(roomErrorCode, t)
              : null;
            return (
              <span key={step.key} className={[styles.step, styles[step.status]].join(' ')}>
                <StepIcon status={step.status} />
                <span>{step.label}</span>
                {errLabel && <span className={styles.errorDetail}>{errLabel}</span>}
              </span>
            );
          })}
      </span>
    </div>
  );
}
