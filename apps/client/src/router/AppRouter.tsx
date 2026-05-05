import { createBrowserRouter, Navigate } from 'react-router-dom';
import RootLayout from './RootLayout';
import { RequireAuth, RequireUnauth, RequireNonObserver } from './guards';
import LandingRoute from '../routes/LandingRoute';
import AuthRoute from '../routes/AuthRoute';
import DashboardRoute from '../routes/DashboardRoute';
import RoomLobbyRoute from '../routes/RoomLobbyRoute';
import RoomSessionRoute from '../routes/RoomSessionRoute';
import JoinResolverRoute from '../routes/JoinResolverRoute';

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
            <RequireNonObserver>
              <DashboardRoute />
            </RequireNonObserver>
          </RequireAuth>
        ),
      },
      {
        path: 'rooms/:id',
        element: (
          <RequireAuth>
            <RoomLobbyRoute />
          </RequireAuth>
        ),
      },
      {
        path: 'rooms/:id/session',
        element: (
          <RequireAuth>
            <RoomSessionRoute />
          </RequireAuth>
        ),
      },
      {
        path: 'join/:token',
        element: <JoinResolverRoute />,
      },
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);
