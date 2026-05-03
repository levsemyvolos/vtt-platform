import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { RoomDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { updateRoom } from '../../store/room';
import Modal from '../common/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import styles from './CreateRoomModal.module.css';

export interface EditRoomModalProps {
  room: RoomDTO;
  onClose: () => void;
}

const SYSTEM_PRESETS = ['D&D 5e', 'Pathfinder', 'Call of Cthulhu', 'Homebrew'] as const;

export default function EditRoomModal({ room, onClose }: EditRoomModalProps) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['room', 'common', 'errors']);
  const { status } = useAppSelector((s) => s.room);

  const [name, setName] = useState(room.name);
  const [system, setSystem] = useState(room.gameSystem);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('errors:validation.roomNameRequired'));
      return;
    }
    setError(null);
    const result = await dispatch(
      updateRoom({ id: room.id, name: name.trim(), gameSystem: system }),
    );
    if (updateRoom.fulfilled.match(result)) onClose();
  };

  return (
    <Modal title={t('room:edit.title')} onClose={onClose}>
      <form
        onSubmit={(e) => void handleSubmit(e)}
        aria-label={t('room:dashboard.formLabel')}
        className={styles.form}
      >
        <Input
          label={t('common:label.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          aria-required="true"
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
            required
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
            {t('room:edit.submit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
