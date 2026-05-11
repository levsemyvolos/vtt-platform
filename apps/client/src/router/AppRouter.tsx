import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import RootLayout from './RootLayout';
import { RequireAuth, RequireUnauth, RequireNonObserver } from './guards';
// Landing + auth stay eager — they own the first paint.
import LandingRoute from '../routes/LandingRoute';
import AuthRoute from '../routes/AuthRoute';
// Heavy routes are split off so the landing bundle doesn't drag in Konva,
// dice-box (Three.js), Redux slices used only inside rooms, etc.
const DashboardRoute = lazy(() => import('../routes/DashboardRoute'));
const RoomLobbyRoute = lazy(() => import('../routes/RoomLobbyRoute'));
const RoomSessionRoute = lazy(() => import('../routes/RoomSessionRoute'));
const JoinResolverRoute = lazy(() => import('../routes/JoinResolverRoute'));

const RouteFallback = () => (
  <div className="app-route-fallback" style={{ padding: '2rem', textAlign: 'center' }}>
    Loading…
  </div>
);

const withSuspense = (node: React.ReactNode) => (
  <Suspense fallback={<RouteFallback />}>{node}</Suspense>
);

export const appRouter = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <LandingRoute />,
      },
      {
        path: 'auth',
        element: (
          <RequireUnauth>
            <AuthRoute />
          </RequireUnauth>
        ),
      },
      {
        path: 'dashboard',
        element: (
          <RequireAuth>
            <RequireNonObserver>{withSuspense(<DashboardRoute />)}</RequireNonObserver>
          </RequireAuth>
        ),
      },
      {
        path: 'rooms/:id',
        element: <RequireAuth>{withSuspense(<RoomLobbyRoute />)}</RequireAuth>,
      },
      {
        path: 'rooms/:id/session',
        element: <RequireAuth>{withSuspense(<RoomSessionRoute />)}</RequireAuth>,
      },
      {
        path: 'join/:token',
        element: withSuspense(<JoinResolverRoute />),
      },
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);
