import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store';
import { fetchRoom } from '../store/room';
import RoomLobby from '../pages/RoomLobby/RoomLobby';

export default function RoomLobbyRoute(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { currentRoom, sessionActive, status: roomStatus } = useAppSelector((s) => s.room);
  const initializedRef = useRef(false);

  // Hydrate room from URL param if not already loaded
  useEffect(() => {
    if (!id || currentRoom?.id === id) return;
    void dispatch(fetchRoom(id));
  }, [id, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track when room was successfully loaded so we can detect later clearing
  useEffect(() => {
    if (currentRoom?.id === id) {
      initializedRef.current = true;
    }
  }, [currentRoom, id]);

  // Navigate to session when GM starts (WS room:started → startSession dispatch)
  useEffect(() => {
    if (sessionActive && id) {
      navigate(`/rooms/${id}/session`, { replace: true });
    }
  }, [sessionActive, id, navigate]);

  // Navigate to dashboard if room was deleted or forbidden
  useEffect(() => {
    if (roomStatus === 'error') {
      navigate('/dashboard', { replace: true });
    }
  }, [roomStatus, navigate]);

  // Navigate to dashboard if room was cleared after being loaded (e.g. room:deleted)
  useEffect(() => {
    if (initializedRef.current && !currentRoom && roomStatus !== 'loading') {
      navigate('/dashboard', { replace: true });
    }
  }, [currentRoom, roomStatus, navigate]);

  return <main className="room-screen"><RoomLobby /></main>;
}
