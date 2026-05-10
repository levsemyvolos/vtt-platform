import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../store';
import { setKicked } from '../../store/notifications';
import ConfirmModal from '../common/ConfirmModal';

export default function KickedModal(): JSX.Element | null {
  const { t } = useTranslation(['gameroom', 'common']);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const kicked = useAppSelector((s) => s.notifications.kicked);

  if (!kicked) return null;

  function handleOk(): void {
    dispatch(setKicked(false));
    void navigate('/dashboard');
  }

  return (
    <ConfirmModal
      open
      title={t('gameroom:kicked.title')}
      message={t('gameroom:kicked.body')}
      confirmLabel={t('common:btn.ok')}
      cancelLabel={false}
      variant="danger"
      onConfirm={handleOk}
      onClose={handleOk}
    />
  );
}
