import { useState } from 'react';
import { useAppSelector } from './store';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import ObserverEntry from './pages/Auth/ObserverEntry';
import Dashboard from './pages/Dashboard/Dashboard';
import RoomLobby from './pages/RoomLobby/RoomLobby';

type AuthView = 'login' | 'register' | 'observer';

export default function App() {
  const { status, currentUser } = useAppSelector((s) => s.session);
  const { currentRoom } = useAppSelector((s) => s.room);
  const [authView, setAuthView] = useState<AuthView>('login');

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
