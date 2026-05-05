import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button, Input } from '../../components/ui';
import { AuthLayout } from '../../components/Auth';
import styles from './Auth.module.css';

type Props = {
  onSwitchToLanding?: () => void;
};

function normalizeCode(raw: string): string {
  // Handle full URL paste: https://host/join/p_TOKEN
  try {
    const url = new URL(raw);
    const match = url.pathname.match(/\/join\/(.+)$/);
    if (match?.[1]) return match[1];
  } catch {
    // not a URL
  }
  // Handle path paste: /join/p_TOKEN
  const pathMatch = raw.match(/\/join\/(.+)$/);
  if (pathMatch?.[1]) return pathMatch[1];
  return raw.trim();
}

export default function JoinPlayer({ onSwitchToLanding }: Props) {
  const { t } = useTranslation(['auth', 'errors']);
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const normalized = normalizeCode(code.trim());
    if (!normalized) {
      setError(t('errors:validation.inviteCodeRequired'));
      return;
    }
    const token =
      normalized.startsWith('p_') || normalized.startsWith('o_')
        ? normalized
        : `p_${normalized}`;
    navigate(`/join/${token}`);
  }

  const handleBack = onSwitchToLanding ?? (() => navigate('/'));

  return (
    <AuthLayout>
      <button type="button" className={styles.backLink} onClick={handleBack}>
        {t('auth:links.backToLanding')}
      </button>
      <h1 className={styles.heading}>{t('auth:joinPlayer.heading')}</h1>
      <form
        onSubmit={handleSubmit}
        aria-label={t('auth:joinPlayer.formLabel')}
        className={styles.form}
      >
        <Input
          label={t('auth:joinPlayer.inviteCodeLabel')}
          id="join-code"
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          fullWidth
        />
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <Button type="submit" variant="primary" fullWidth>
          {t('auth:joinPlayer.submitBtn')}
        </Button>
      </form>
    </AuthLayout>
  );
}
