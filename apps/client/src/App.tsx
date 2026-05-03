import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RoomDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from './store';
import { setCurrentRoom, fetchRoom } from './store/room';
import {
  bootstrapSession,
  selectIsObserver,
  selectObserverBoundRoomId,
  setPrefilledInviteCode,
} from './store/session';
import { addToast } from './store/toast';
import { apiFetch } from './api/apiFetch';
import { useTheme } from './hooks/useTheme';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import ObserverEntry from './pages/Auth/ObserverEntry';
import Landing from './pages/Landing/Landing';
import Dashboard from './pages/Dashboard/Dashboard';
import RoomLobby from './pages/RoomLobby/RoomLobby';
import GameRoom from './pages/GameRoom/GameRoom';
import SceneEditor from './pages/SceneEditor/SceneEditor';
import { AppShell } from './components/layout/AppShell';
import DesktopOnlyGuard from './components/common/DesktopOnlyGuard';
import Toast from './components/common/Toast';
import BootstrapLoader from './components/common/BootstrapLoader';

type AuthView = 'login' | 'register' | 'observer' | 'landing';

interface AuthViewsProps {
  view: AuthView;
  onSwitch: (v: AuthView) => void;
}

function AuthViews({ view, onSwitch }: AuthViewsProps): JSX.Element {
  if (view === 'landing') {
    return (
      <main className="auth-screen">
        <Landing onNavigate={(v) => onSwitch(v)} />
      </main>
    );
  }
  return (
    <main className="auth-screen">
      {view === 'login' && (
        <Login
          onSwitchToRegister={() => onSwitch('register')}
          onSwitchToObserver={() => onSwitch('observer')}
        />
      )}
      {view === 'register' && <Register onSwitchToLogin={() => onSwitch('login')} />}
      {view === 'observer' && <ObserverEntry onSwitchToLogin={() => onSwitch('login')} />}
    </main>
  );
}

interface RoomViewProps {
  sessionActive: boolean;
  editingSceneId: string | null;
}

function RoomView({ sessionActive, editingSceneId }: RoomViewProps): JSX.Element {
  if (sessionActive && editingSceneId) {
    return <main className="room-screen"><SceneEditor /></main>;
  }
  if (sessionActive) {
    return <main className="room-screen"><GameRoom /></main>;
  }
  return <main className="room-screen"><RoomLobby /></main>;
}

export default function App() {
  useTheme();
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['room', 'errors', 'auth']);
  const { status, currentUser, errorSource } = useAppSelector((s) => s.session);
  const { currentRoom, sessionActive, editingSceneId } = useAppSelector((s) => s.room);
  const isObserver = useAppSelector(selectIsObserver);
  const observerBoundRoomId = useAppSelector(selectObserverBoundRoomId);
  // Default to landing unless an invite token is present in the URL.
  const hasInvite = Boolean(new URLSearchParams(window.location.search).get('invite'));
  const [authView, setAuthView] = useState<AuthView>(hasInvite ? 'login' : 'landing');
  const [inviteJoining, setInviteJoining] = useState(false);

  // Wave 3.1 — handle 'bootstrapping' and 'error' (network unreachable).
  // 'error' is shown via BootstrapLoader which has a manual retry button;
  // 'bootstrapping' fires the thunk so it retries after AbortError.
  useEffect(() => {
    if (status === 'bootstrapping') {
      void dispatch(bootstrapSession());
    }
  }, [dispatch, status]);

  // Wave 2.2 — Observer invite pre-fill: if unauthenticated and ?invite= is present,
  // switch to observer form and pre-fill the invite code.
  useEffect(() => {
    if (status === 'authenticated') return;
    const params = new URLSearchParams(window.location.search);
    const invite = params.get('invite');
    if (!invite) return;
    setAuthView('observer');
    dispatch(setPrefilledInviteCode(invite));
  }, [status, dispatch]);

  // Observer: auto-fetch the bound room when there is no currentRoom yet.
  // This also handles the Back-button case: if the observer navigates away,
  // clearRoom() is called, and this effect re-fetches the bound room.
  useEffect(() => {
    if (status !== 'authenticated' || !isObserver || !observerBoundRoomId || currentRoom) return;
    void dispatch(fetchRoom(observerBoundRoomId));
  }, [status, isObserver, observerBoundRoomId, currentRoom, dispatch]);

  // Wave 2.1 — Parse ?invite=TOKEN on mount and join the room if authenticated non-observer.
  // Errors shown as toasts; URL only cleared on success.
  useEffect(() => {
    if (status !== 'authenticated' || currentRoom || isObserver || inviteJoining) return;
    const params = new URLSearchParams(window.location.search);
    const invite = params.get('invite');
    if (!invite) return;
    setInviteJoining(true);
    apiFetch<RoomDTO>('/api/rooms/join', {
      method: 'POST',
      body: JSON.stringify({ token: invite }),
    })
      .then((room) => {
        dispatch(setCurrentRoom(room));
        // Clear invite param only on success so the user can see what happened on failure.
        window.history.replaceState({}, '', window.location.pathname);
        dispatch(addToast('success', t('room:invite.joined', { name: room.name })));
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error && err.message === 'Invalid invite token'
          ? t('errors:invite.expired')
          : t('errors:invite.failed');
        dispatch(addToast('error', msg));
      })
      .finally(() => {
        setInviteJoining(false);
      });
  }, [status, currentRoom, isObserver, dispatch, t, inviteJoining]);

  // Observer loading state: authenticated as observer but room not yet loaded
  const observerLoadingRoom =
    status === 'authenticated' && isObserver && !currentRoom && Boolean(observerBoundRoomId);

  return (
    <DesktopOnlyGuard>
      <Toast />
      {/* Wave 6.2: BootstrapLoader only for bootstrap-level errors (network/5xx), NOT for
           authForm rejections (login 401, register 409, observer invalid invite). */}
      {status === 'bootstrapping' || (status === 'error' && errorSource === 'bootstrap') || inviteJoining || observerLoadingRoom ? (
        <BootstrapLoader networkError={status === 'error'} onRetry={() => void dispatch(bootstrapSession())} />
      ) : status !== 'authenticated' || !currentUser ? (
        <AuthViews view={authView} onSwitch={setAuthView} />
      ) : currentRoom ? (
        // Both observers and regular users see RoomView; observers are locked here
        <RoomView sessionActive={sessionActive} editingSceneId={editingSceneId} />
      ) : isObserver ? (
        // Observer authenticated but has no valid boundRoomId (degenerate case) — show loader
        <BootstrapLoader />
      ) : (
        <AppShell>
          <Dashboard />
        </AppShell>
      )}
    </DesktopOnlyGuard>
  );
}
