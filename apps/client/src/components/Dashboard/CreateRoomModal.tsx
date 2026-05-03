import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../store';
import { createRoom } from '../../store/room';
import Modal from '../common/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import styles from './CreateRoomModal.module.css';

export interface CreateRoomModalProps {
  onClose: () => void;
}

const SYSTEM_PRESETS = ['D&D 5e', 'Pathfinder', 'Call of Cthulhu', 'Homebrew'] as const;

export default function CreateRoomModal({ onClose }: CreateRoomModalProps) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['room', 'common', 'errors']);
  const { status } = useAppSelector((s) => s.room);

  const [name, setName] = useState('');
  const [system, setSystem] = useState<string>('D&D 5e');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('errors:validation.roomNameRequired'));
      return;
    }
    setError(null);
    const result = await dispatch(createRoom({ name: name.trim(), gameSystem: system }));
    if (createRoom.fulfilled.match(result)) onClose();
  };

  return (
    <Modal title={t('room:dashboard.newRoomHeading')} onClose={onClose}>
      <form
        onSubmit={(e) => void handleSubmit(e)}
        aria-label={t('room:dashboard.formLabel')}
        className={styles.form}
      >
        <Input
          label={t('common:label.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
          autoFocus
          maxLength={100}
          showCounter
        />

        <fieldset className={styles.systemRow}>
          <legend className={styles.legend}>{t('common:label.gameSystem')}</legend>
          <div className={styles.systemPresets}>
            {SYSTEM_PRESETS.map((s) => (
              <button
                key={s}
                type="button"
                className={[styles.preset, system === s ? styles.presetActive : ''].filter(Boolean).join(' ')}
                onClick={() => setSystem(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <Input
            value={system}
            onChange={(e) => setSystem(e.target.value)}
            fullWidth
            maxLength={50}
            showCounter
          />
        </fieldset>

        {error && <p role="alert" className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common:btn.cancel')}
          </Button>
          <Button type="submit" variant="primary" isLoading={status === 'loading'}>
            {t('common:btn.create')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
