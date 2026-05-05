import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store';
import { fetchRoom } from '../store/room';
import GameRoom from '../pages/GameRoom/GameRoom';
import SceneEditor from '../pages/SceneEditor/SceneEditor';

export default function RoomSessionRoute(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { currentRoom, sessionActive, editingSceneId, status: roomStatus } = useAppSelector((s) => s.room);
  const initializedRef = useRef(false);

  // Hydrate room from URL param if not already loaded
  useEffect(() => {
    if (!id || currentRoom?.id === id) return;
    void dispatch(fetchRoom(id));
  }, [id, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track when room was successfully loaded
  useEffect(() => {
    if (currentRoom?.id === id) {
      initializedRef.current = true;
    }
  }, [currentRoom, id]);

  // If session is not active after room loaded → go back to lobby
  useEffect(() => {
    if (currentRoom && !sessionActive && roomStatus === 'loaded') {
      navigate(`/rooms/${id}`, { replace: true });
    }
  }, [currentRoom, sessionActive, roomStatus, id, navigate]);

  // Navigate to dashboard on fetch error or room deletion
  useEffect(() => {
    if (roomStatus === 'error') {
      navigate('/dashboard', { replace: true });
    }
  }, [roomStatus, navigate]);

  useEffect(() => {
    if (initializedRef.current && !currentRoom && roomStatus !== 'loading') {
      navigate('/dashboard', { replace: true });
    }
  }, [currentRoom, roomStatus, navigate]);

  if (editingSceneId) {
    return <main className="room-screen"><SceneEditor /></main>;
  }
  return <main className="room-screen"><GameRoom /></main>;
}
