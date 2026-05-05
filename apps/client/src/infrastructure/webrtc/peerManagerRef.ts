import type { PeerManager } from './PeerManager';

/**
 * Module-scoped reference to the active PeerManager instance.
 * Set by VideoCall on bootstrap; consumed by GameRoomTopBar (Reconnect button).
 * Lifetime is bound to the VideoCall component — null when no call is active.
 */
export const peerManagerRef: { current: PeerManager | null } = { current: null };
