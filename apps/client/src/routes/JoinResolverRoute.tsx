import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { RoomDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../store';
import { setCurrentRoom } from '../store/room';
import { addToast } from '../store/toast';
import { apiFetch } from '../api/apiFetch';
import BootstrapLoader from '../components/common/BootstrapLoader';

export default function JoinResolverRoute(): JSX.Element {
  const { token } = useParams<{ token: string }>();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { t } = useTranslation(['errors', 'room']);
  const { status, currentUser } = useAppSelector((s) => s.session);
  const isObserver = useAppSelector((s) => s.session.currentUser?.boundRoomId !== undefined);
  const handledRef = useRef(false);

  useEffect(() => {
    if (!token || handledRef.current) return;

    const isObserverInvite = token.startsWith('o_');
    const isPlayerInvite = token.startsWith('p_');
    const rawToken = (isPlayerInvite || isObserverInvite) ? token.slice(2) : token;

    // Wait for bootstrap to resolve
    if (status === 'bootstrapping') return;

    // Not authenticated → redirect to auth with appropriate view
    if (status !== 'authenticated' || !currentUser) {
      handledRef.current = true;
      if (isObserverInvite) {
        navigate(`/auth?view=observer&token=${encodeURIComponent(rawToken)}`, { replace: true });
      } else {
        navigate(
          `/auth?view=login&next=${encodeURIComponent(`/join/${token}`)}`,
          { replace: true },
        );
      }
      return;
    }

    // Authenticated: handle invite
    handledRef.current = true;

    if (isObserverInvite && !isObserver) {
      dispatch(addToast('warning', t('errors:invite.observerWhileLoggedIn')));
      navigate('/dashboard', { replace: true });
      return;
    }

    apiFetch<RoomDTO>('/api/rooms/join', {
      method: 'POST',
      body: JSON.stringify({ token: rawToken }),
    })
      .then((room) => {
        dispatch(setCurrentRoom(room));
        dispatch(addToast('success', t('room:invite.joined', { name: room.name })));
        navigate(`/rooms/${room.id}`, { replace: true });
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error && err.message === 'Invalid invite token'
            ? t('errors:invite.expired')
            : t('errors:invite.failed');
        dispatch(addToast('error', msg));
        navigate('/dashboard', { replace: true });
      });
  }, [token, status, currentUser, isObserver, dispatch, navigate, t]);

  return <BootstrapLoader />;
}
