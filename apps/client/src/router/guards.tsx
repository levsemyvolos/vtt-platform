import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '../store';
import { selectIsObserver, selectObserverBoundRoomId } from '../store/session';

export function RequireAuth({ children }: { children: ReactNode }): JSX.Element {
  const { status, currentUser } = useAppSelector((s) => s.session);
  const location = useLocation();

  // While bootstrapping, RootLayout shows BootstrapLoader — nothing to render here
  if (status === 'bootstrapping' || status === 'loading') {
    return <></>;
  }

  if (status !== 'authenticated' || !currentUser) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?next=${next}`} replace />;
  }

  return <>{children}</>;
}

export function RequireUnauth({ children }: { children: ReactNode }): JSX.Element {
  const { status } = useAppSelector((s) => s.session);
  const isObserver = useAppSelector(selectIsObserver);
  const boundRoomId = useAppSelector(selectObserverBoundRoomId);

  if (status === 'authenticated') {
    if (isObserver && boundRoomId) {
      return <Navigate to={`/rooms/${boundRoomId}`} replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export function RequireNonObserver({ children }: { children: ReactNode }): JSX.Element {
  const isObserver = useAppSelector(selectIsObserver);
  const boundRoomId = useAppSelector(selectObserverBoundRoomId);

  if (isObserver && boundRoomId) {
    return <Navigate to={`/rooms/${boundRoomId}`} replace />;
  }

  return <>{children}</>;
}
