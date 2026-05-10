import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store';
import { bootstrapSession } from '../store/session';
import { useTheme } from '../hooks/useTheme';
import DesktopOnlyGuard from '../components/common/DesktopOnlyGuard';
import Toast from '../components/common/Toast';
import BootstrapLoader from '../components/common/BootstrapLoader';
import KickedModal from '../components/GameRoom/KickedModal';

export default function RootLayout(): JSX.Element {
  useTheme();
  const dispatch = useAppDispatch();
  const { status, errorSource } = useAppSelector((s) => s.session);

  useEffect(() => {
    if (status === 'bootstrapping') {
      void dispatch(bootstrapSession());
    }
  }, [dispatch, status]);

  const isBooting =
    status === 'bootstrapping' ||
    (status === 'error' && errorSource === 'bootstrap');

  return (
    <DesktopOnlyGuard>
      <Toast />
      <KickedModal />
      {isBooting ? (
        <BootstrapLoader
          networkError={status === 'error'}
          onRetry={() => void dispatch(bootstrapSession())}
        />
      ) : (
        <Outlet />
      )}
    </DesktopOnlyGuard>
  );
}
