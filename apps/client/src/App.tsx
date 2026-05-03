import { useEffect, useRef, useState } from 'react';
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
          onSwitchToLanding={() => onSwitch('landing')}
        />
      )}
      {view === 'register' && (
        <Register
          onSwitchToLogin={() => onSwitch('login')}
          onSwitchToLanding={() => onSwitch('landing')}
        />
      )}
      {view === 'observer' && (
        <ObserverEntry
          onSwitchToLogin={() => onSwitch('login')}
          onSwitchToLanding={() => onSwitch('landing')}
        />
      )}
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
  // B7-BUG-001: detect prefix to choose the correct initial view.
  const initialInviteParam = new URLSearchParams(window.location.search).get('invite') ?? '';
  const initialIsObserver = initialInviteParam.startsWith('o_');
  const hasInvite = initialInviteParam.length > 0;
  const [authView, setAuthView] = useState<AuthView>(
    hasInvite ? (initialIsObserver ? 'observer' : 'login') : 'landing',
  );
  const [inviteJoining, setInviteJoining] = useState(false);
  // B7-BUG-004: idempotency guard — prevent the invite effect from firing more than once.
  const inviteHandled = useRef(false);
  // R2-MIN-009: track previous auth status to detect logout transition.
  const prevStatusRef = useRef(status);

  // R2-MIN-006: after logout (authenticated → idle) send user back to landing.
  useEffect(() => {
    if (prevStatusRef.current === 'authenticated' && status === 'idle') {
      setAuthView('landing');
    }
    prevStatusRef.current = status;
  }, [status]);

  // Wave 3.1 — handle 'bootstrapping' and 'error' (network unreachable).
  // 'error' is shown via BootstrapLoader which has a manual retry button;
  // 'bootstrapping' fires the thunk so it retries after AbortError.
  useEffect(() => {
    if (status === 'bootstrapping') {
      void dispatch(bootstrapSession());
    }
  }, [dispatch, status]);

  // Wave 2.2 / Wave 6.3.1 — Unauthenticated invite landing:
  // Parse ?invite= prefix to route to the correct auth form.
  //   ?invite=p_TOKEN (or no prefix, legacy) → Login form (player flow)
  //   ?invite=o_TOKEN → Observer form + pre-fill code
  useEffect(() => {
    if (status === 'authenticated') return;
    const params = new URLSearchParams(window.location.search);
    const inviteParam = params.get('invite');
    if (!inviteParam) return;

    const isObserverInvite = inviteParam.startsWith('o_');
    const rawToken = (inviteParam.startsWith('p_') || isObserverInvite)
      ? inviteParam.slice(2)
      : inviteParam; // legacy: no prefix → treat as player token

    if (isObserverInvite) {
      setAuthView('observer');
      dispatch(setPrefilledInviteCode(rawToken));
    } else {
      // Player or legacy token — go to login, pre-fill code for potential use
      setAuthView('login');
      dispatch(setPrefilledInviteCode(rawToken));
    }
  }, [status, dispatch]);

  // Observer: auto-fetch the bound room when there is no currentRoom yet.
  // This also handles the Back-button case: if the observer navigates away,
  // clearRoom() is called, and this effect re-fetches the bound room.
  useEffect(() => {
    if (status !== 'authenticated' || !isObserver || !observerBoundRoomId || currentRoom) return;
    void dispatch(fetchRoom(observerBoundRoomId));
  }, [status, isObserver, observerBoundRoomId, currentRoom, dispatch]);

  // Wave 2.1 / Wave 6.3.1+6.3.2 — Authenticated invite handler.
  // B7-BUG-001: type-check prefix before deciding to join.
  // B7-BUG-004: idempotency guard (inviteHandled ref) prevents toast storm on re-renders.
  useEffect(() => {
    if (status !== 'authenticated' || currentRoom || isObserver || inviteJoining) return;
    if (inviteHandled.current) return;

    const params = new URLSearchParams(window.location.search);
    const inviteParam = params.get('invite');
    if (!inviteParam) return;

    const isObserverInvite = inviteParam.startsWith('o_');
    const isPlayerInvite = inviteParam.startsWith('p_');
    const rawToken = (isPlayerInvite || isObserverInvite)
      ? inviteParam.slice(2)
      : inviteParam; // legacy: no prefix → treat as player token

    // B7-BUG-004: logged-in user opened an observer link — don't auto-join, warn instead.
    if (isObserverInvite) {
      inviteHandled.current = true;
      dispatch(addToast('warning', t('errors:invite.observerWhileLoggedIn')));
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    // Player invite (or legacy without prefix) — attempt to join.
    inviteHandled.current = true;
    setInviteJoining(true);
    apiFetch<RoomDTO>('/api/rooms/join', {
      method: 'POST',
      body: JSON.stringify({ token: rawToken }),
    })
      .then((room) => {
        dispatch(setCurrentRoom(room));
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
