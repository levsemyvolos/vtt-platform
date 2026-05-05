import { Navigate, useNavigate } from 'react-router-dom';
import { useAppSelector } from '../store';
import Landing from '../pages/Landing/Landing';

export default function LandingRoute(): JSX.Element {
  const { status, currentUser } = useAppSelector((s) => s.session);
  const navigate = useNavigate();

  if (status === 'authenticated' && currentUser) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <main className="auth-screen">
      <Landing onNavigate={(view) => navigate(`/auth?view=${view}`)} />
    </main>
  );
}
