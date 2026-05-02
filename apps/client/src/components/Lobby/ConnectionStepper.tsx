import { useEffect, useState } from 'react';
import { Check, Loader2, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../store';
import { getSocket } from '../../api/socket';
import styles from './ConnectionStepper.module.css';

type StepStatus = 'done' | 'active' | 'error' | 'pending';

interface StepDef {
  key: string;
  label: string;
  status: StepStatus;
  diagnostic?: string;
}

interface Props {
  networkError?: string | null;
}

export default function ConnectionStepper({ networkError }: Props): JSX.Element {
  const { t } = useTranslation('room');
  const sessionStatus = useAppSelector((s) => s.session.status);
  const roomStatus = useAppSelector((s) => s.room.status);
  const [socketConnected, setSocketConnected] = useState(false);

  useEffect(() => {
    const s = getSocket();
    setSocketConnected(s.connected);
    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, []);

  const authDone = sessionStatus === 'authenticated';
  const roomLoaded = roomStatus === 'loaded';

  const steps: StepDef[] = [
    {
      key: 'authenticating',
      label: t('lobby.stepper.authenticating'),
      status: authDone ? 'done' : 'active',
    },
    {
      key: 'loadingScene',
      label: t('lobby.stepper.loadingScene'),
      status: !authDone ? 'pending' : roomLoaded ? 'done' : 'active',
    },
    {
      key: 'openingChannel',
      label: t('lobby.stepper.openingChannel'),
      status: !roomLoaded
        ? 'pending'
        : networkError
          ? 'error'
          : socketConnected
            ? 'done'
            : 'active',
      ...(networkError ? { diagnostic: networkError } : {}),
    },
  ];

  return (
    <div className={styles.stepper} role="status" aria-label={t('lobby.stepper.label')}>
      {steps.map((step) => (
        <div key={step.key} className={[styles.step, styles[step.status]].join(' ')}>
          <span className={styles.icon}>
            {step.status === 'done' && <Check size={16} aria-hidden="true" />}
            {step.status === 'active' && (
              <Loader2 size={16} className={styles.spin} aria-hidden="true" />
            )}
            {step.status === 'error' && <AlertCircle size={16} aria-hidden="true" />}
            {step.status === 'pending' && <span className={styles.dot} aria-hidden="true" />}
          </span>
          <span className={styles.label}>{step.label}</span>
          {step.diagnostic && (
            <span className={styles.diagnostic}>{step.diagnostic}</span>
          )}
        </div>
      ))}
    </div>
  );
}
