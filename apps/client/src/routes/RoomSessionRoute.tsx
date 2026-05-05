import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store';
import { fetchRoom, startSession } from '../store/room';
import GameRoom from '../pages/GameRoom/GameRoom';
import SceneEditor from '../pages/SceneEditor/SceneEditor';

export default function RoomSessionRoute(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { currentRoom, sessionActive, editingSceneId, status: roomStatus } = useAppSelector((s) => s.room);
  const initializedRef = useRef(false);
  // Prevents re-running activation after startSession() causes a re-render
  const activatedRef = useRef(false);

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

  // One-time activation: on first load decide whether to enter session or redirect to lobby
  useEffect(() => {
    if (!currentRoom || roomStatus !== 'loaded' || activatedRef.current) return;
    activatedRef.current = true;
    if (currentRoom.status === 'active') {
      // Deeplink or F5: room is active → ensure sessionActive is set
      if (!sessionActive) dispatch(startSession());
    } else if (!sessionActive) {
      // Room not yet started AND client hasn't been told session is active → redirect to lobby.
      // If sessionActive is already true (WS room:started fired while in lobby), stay here —
      // currentRoom.status may be stale from before the GM started the session.
      navigate(`/rooms/${id}`, { replace: true });
    }
  }, [currentRoom, roomStatus, id, sessionActive, dispatch, navigate]);

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
