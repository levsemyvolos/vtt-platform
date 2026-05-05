import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store';
import { setPrefilledInviteCode, selectIsObserver, selectObserverBoundRoomId } from '../store/session';
import Login from '../pages/Auth/Login';
import Register from '../pages/Auth/Register';
import ObserverEntry from '../pages/Auth/ObserverEntry';
import JoinPlayer from '../pages/Auth/JoinPlayer';

type AuthView = 'login' | 'register' | 'observer' | 'join-player' | 'join-observer';

function toAuthView(raw: string | null): AuthView {
  if (raw === 'register' || raw === 'observer' || raw === 'join-player' || raw === 'join-observer') return raw;
  return 'login';
}

export default function AuthRoute(): JSX.Element {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { status, currentUser } = useAppSelector((s) => s.session);
  const isObserver = useAppSelector(selectIsObserver);
  const boundRoomId = useAppSelector(selectObserverBoundRoomId);

  const nextPath = searchParams.get('next') ?? '/dashboard';
  const [authView, setAuthView] = useState<AuthView>(toAuthView(searchParams.get('view')));

  // Pre-fill observer invite code passed via ?token= (from JoinResolverRoute)
  useEffect(() => {
    const token = searchParams.get('token');
    if (token) dispatch(setPrefilledInviteCode(token));
  }, [searchParams, dispatch]);

  // Redirect after successful auth
  useEffect(() => {
    if (status !== 'authenticated' || !currentUser) return;
    if (isObserver && boundRoomId) {
      navigate(`/rooms/${boundRoomId}`, { replace: true });
    } else {
      navigate(nextPath, { replace: true });
    }
  }, [status, currentUser, isObserver, boundRoomId, navigate, nextPath]);

  return (
    <main className="auth-screen">
      {authView === 'login' && (
        <Login
          onSwitchToRegister={() => setAuthView('register')}
          onSwitchToObserver={() => setAuthView('observer')}
          onSwitchToLanding={() => navigate('/')}
        />
      )}
      {authView === 'register' && (
        <Register
          onSwitchToLogin={() => setAuthView('login')}
          onSwitchToLanding={() => navigate('/')}
        />
      )}
      {authView === 'observer' && (
        <ObserverEntry
          onSwitchToLogin={() => setAuthView('login')}
          onSwitchToLanding={() => navigate('/')}
        />
      )}
      {authView === 'join-player' && (
        <JoinPlayer onSwitchToLanding={() => navigate('/')} />
      )}
      {authView === 'join-observer' && (
        <ObserverEntry
          onSwitchToLogin={() => setAuthView('login')}
          onSwitchToLanding={() => navigate('/')}
        />
      )}
    </main>
  );
}
