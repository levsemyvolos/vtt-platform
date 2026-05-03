import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { RoomDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { deleteRoom } from '../../store/room';
import Modal from '../common/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import styles from './DeleteRoomModal.module.css';

export interface DeleteRoomModalProps {
  room: RoomDTO;
  onClose: () => void;
  onDeleted?: () => void;
}

export default function DeleteRoomModal({ room, onClose, onDeleted }: DeleteRoomModalProps) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['room', 'common', 'errors']);
  const { status } = useAppSelector((s) => s.room);

  const [confirmName, setConfirmName] = useState('');

  const isMatch = confirmName === room.name;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isMatch) return;
    const result = await dispatch(deleteRoom(room.id));
    if (deleteRoom.fulfilled.match(result)) {
      onClose();
      onDeleted?.();
    }
  };

  return (
    <Modal title={t('room:delete.title')} onClose={onClose}>
      <form
        onSubmit={(e) => void handleSubmit(e)}
        aria-label={t('room:delete.title')}
        className={styles.form}
      >
        <p className={styles.warning}>
          {t('room:delete.confirm', { name: room.name })}
        </p>
        <Input
          label={t('room:delete.typeName')}
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          fullWidth
          autoFocus
          placeholder={room.name}
        />

        <div className={styles.actions}>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common:btn.cancel')}
          </Button>
          <Button
            type="submit"
            variant="danger"
            isLoading={status === 'loading'}
            disabled={!isMatch}
          >
            {t('room:delete.submitBtn')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
