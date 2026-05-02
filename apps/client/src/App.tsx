import { useEffect, useState } from 'react';
import type { RoomDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from './store';
import { setCurrentRoom } from './store/room';
import { bootstrapSession } from './store/session';
import { apiFetch } from './api/apiFetch';
import { useTheme } from './hooks/useTheme';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import ObserverEntry from './pages/Auth/ObserverEntry';
import Dashboard from './pages/Dashboard/Dashboard';
import RoomLobby from './pages/RoomLobby/RoomLobby';
import GameRoom from './pages/GameRoom/GameRoom';
import SceneEditor from './pages/SceneEditor/SceneEditor';
import { AppShell } from './components/layout/AppShell';
import DesktopOnlyGuard from './components/common/DesktopOnlyGuard';
import Toast from './components/common/Toast';

type AuthView = 'login' | 'register' | 'observer';

interface AuthViewsProps {
  view: AuthView;
  onSwitch: (v: AuthView) => void;
}

function AuthViews({ view, onSwitch }: AuthViewsProps): JSX.Element {
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
  const { status, currentUser } = useAppSelector((s) => s.session);
  const { currentRoom, sessionActive, editingSceneId } = useAppSelector((s) => s.room);
  const [authView, setAuthView] = useState<AuthView>('login');

  useEffect(() => {
    if (status === 'bootstrapping') {
      void dispatch(bootstrapSession());
    }
  }, [dispatch, status]);

  // Parse ?invite=TOKEN on mount and join the room if authenticated
  useEffect(() => {
    if (status !== 'authenticated' || currentRoom) return;
    const params = new URLSearchParams(window.location.search);
    const invite = params.get('invite');
    if (!invite) return;
    apiFetch<RoomDTO>('/api/rooms/join', {
      method: 'POST',
      body: JSON.stringify({ token: invite }),
    })
      .then((room) => {
        dispatch(setCurrentRoom(room));
        window.history.replaceState({}, '', window.location.pathname);
      })
      .catch(() => {});
  }, [status, currentRoom, dispatch]);

  return (
    <DesktopOnlyGuard>
      <Toast />
      {status === 'bootstrapping' ? (
        <main className="auth-screen" aria-busy="true" />
      ) : status !== 'authenticated' || !currentUser ? (
        <AuthViews view={authView} onSwitch={setAuthView} />
      ) : currentRoom ? (
        <RoomView sessionActive={sessionActive} editingSceneId={editingSceneId} />
      ) : (
        <AppShell>
          <Dashboard />
        </AppShell>
      )}
    </DesktopOnlyGuard>
  );
}
