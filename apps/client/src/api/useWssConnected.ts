import { useEffect, useState } from 'react';
import { getSocket } from './socket';

export function useWssConnected(): boolean {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let sock: ReturnType<typeof getSocket>;
    try {
      sock = getSocket();
    } catch {
      return;
    }
    setConnected(sock.connected);
    const onConnect = (): void => setConnected(true);
    const onDisconnect = (): void => setConnected(false);
    sock.on('connect', onConnect);
    sock.on('disconnect', onDisconnect);
    return () => {
      sock.off('connect', onConnect);
      sock.off('disconnect', onDisconnect);
    };
  }, []);
  return connected;
}
