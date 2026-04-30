import { useEffect, useState } from 'react';
import type { RoomDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from './store';
import { setCurrentRoom } from './store/room';
import { apiFetch } from './api/apiFetch';
import { useTheme } from './hooks/useTheme';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import ObserverEntry from './pages/Auth/ObserverEntry';
import Dashboard from './pages/Dashboard/Dashboard';
import RoomLobby from './pages/RoomLobby/RoomLobby';

type AuthView = 'login' | 'register' | 'observer';

export default function App() {
  useTheme();
  const dispatch = useAppDispatch();
  const { status, currentUser } = useAppSelector((s) => s.session);
  const { currentRoom } = useAppSelector((s) => s.room);
  const [authView, setAuthView] = useState<AuthView>('login');

  // На старті: парсинг ?invite=TOKEN → якщо залогінений і не в кімнаті → POST /rooms/join
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
      .catch(() => {
        // Endpoint відсутній до Чату 7.4 — тихо ігноруємо, користувач залишається на дашборді
      });
  }, [status, currentRoom, dispatch]);

  // Unauthenticated / Authenticating states
  if (status !== 'authenticated' || !currentUser) {
    return (
      <main className="auth-screen">
        {authView === 'login' && (
          <Login
            onSwitchToRegister={() => setAuthView('register')}
            onSwitchToObserver={() => setAuthView('observer')}
          />
        )}
        {authView === 'register' && (
          <Register onSwitchToLogin={() => setAuthView('login')} />
        )}
        {authView === 'observer' && (
          <ObserverEntry onSwitchToLogin={() => setAuthView('login')} />
        )}
      </main>
    );
  }

  // RoomLobby state
  if (currentRoom) {
    return (
      <main className="room-screen">
        <RoomLobby />
      </main>
    );
  }

  // Dashboard state
  return (
    <main className="dashboard-screen">
      <Dashboard />
    </main>
  );
}
