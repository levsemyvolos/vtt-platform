/**
 * useWebRTCStats — Phase 2 stub.
 * Returns null until a PeerManager integration hook is wired up (Phase 6+).
 * NavStatusStrip renders PingMeter only when rtt != null, so this is safe.
 */
export function useWebRTCStats(): { rtt: number | null } {
  return { rtt: null };
}
