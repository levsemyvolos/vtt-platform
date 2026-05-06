import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Modal from '../common/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import styles from './JoinByCodeModal.module.css';

export interface JoinByCodeModalProps {
  onClose: () => void;
}

function normalizeCode(raw: string): string {
  try {
    const url = new URL(raw);
    const match = url.pathname.match(/\/join\/(.+)$/);
    if (match?.[1]) return match[1];
  } catch {
    // not a URL
  }
  const pathMatch = raw.match(/\/join\/(.+)$/);
  if (pathMatch?.[1]) return pathMatch[1];
  return raw.trim();
}

export default function JoinByCodeModal({ onClose }: JoinByCodeModalProps): JSX.Element {
  const { t } = useTranslation(['room', 'common', 'errors']);
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
    if (normalized.startsWith('o_')) {
      setError(t('errors:invite.observerWhileLoggedIn'));
      return;
    }
    const token = normalized.startsWith('p_') ? normalized : `p_${normalized}`;
    onClose();
    navigate(`/join/${token}`);
  }

  return (
    <Modal title={t('room:dashboard.joinModal.heading')} onClose={onClose}>
      <form
        onSubmit={handleSubmit}
        aria-label={t('room:dashboard.joinModal.formLabel')}
        className={styles.form}
      >
        <Input
          label={t('room:dashboard.joinModal.inputLabel')}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (error) setError(null);
          }}
          placeholder={t('room:dashboard.joinModal.placeholder')}
          autoComplete="off"
          autoFocus
          fullWidth
        />

        {error && <p role="alert" className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common:btn.cancel')}
          </Button>
          <Button type="submit" variant="primary">
            {t('room:dashboard.joinModal.submitBtn')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
