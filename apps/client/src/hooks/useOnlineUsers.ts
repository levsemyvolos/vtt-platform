import { useAppSelector } from '../store';

/**
 * useOnlineUsers — reads online participant count from session store.
 * Falls back to 0 when session slice or onlineCount is absent.
 * NavStatusStrip shows Badge only when count > 0.
 */
export function useOnlineUsers(): { count: number } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const count = useAppSelector((s: any) => s.session?.onlineCount ?? 0);
  return { count };
}
