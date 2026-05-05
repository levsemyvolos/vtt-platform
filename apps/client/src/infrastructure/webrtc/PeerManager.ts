import type { IceServer, SignalingPayload } from '@vtt/shared';

type SignalSender = (
  event: 'signal:offer' | 'signal:answer' | 'signal:ice',
  payload: SignalingPayload,
) => void;

export interface PeerManagerCallbacks {
  /** Sends a signaling envelope through the WSS proxy (server forwards as-is). */
  sendSignal: SignalSender;
  onRemoteStream: (peerId: string, stream: MediaStream) => void;
  onConnectionStateChange?: (peerId: string, state: RTCPeerConnectionState) => void;
  onPeerClosed?: (peerId: string) => void;
  /** Fired when an SDP/ICE operation fails irrecoverably (e.g. RTP extension reassignment). */
  onNegotiationError?: (peerId: string, err: Error) => void;
}

export interface PeerManagerOptions {
  selfUserId: string;
  roomId: string;
  iceServers: IceServer[];
  callbacks: PeerManagerCallbacks;
}

interface PeerEntry {
  pc: RTCPeerConnection;
  /** Buffer ICE-candidates that arrive before remote SDP is set. */
  pendingCandidates: RTCIceCandidateInit[];
  remoteDescriptionSet: boolean;
}

/**
 * Thin wrapper over the W3C `RTCPeerConnection` (lib.dom.d.ts). Encapsulates
 * Process View scenario E (рис. А.8): parallel ICE gathering, SDP offer /
 * answer exchange and host → TURN-relay fallback. Per §2.13.4 mesh ceiling,
 * supports ≤ 6 peers — for larger sessions an SFU is required (TODO).
 *
 * Signaling transport is abstracted via the `sendSignal` callback (the WSS
 * proxy in `apps/server/src/socketio/handlers/signaling.ts`). The server
 * never inspects SDP / ICE blobs — they are forwarded to the peer's personal
 * room.
 */
export class PeerManager {
  private readonly peers = new Map<string, PeerEntry>();
  private localStream: MediaStream | null = null;
  private readonly opts: PeerManagerOptions;
  private iceServers: IceServer[];

  constructor(opts: PeerManagerOptions) {
    this.opts = opts;
    this.iceServers = opts.iceServers;
  }

  /** Replace ICE servers used for new RTCPeerConnections (TURN credential refresh). */
  setIceServers(servers: IceServer[]): void {
    this.iceServers = servers;
  }

  // --------------- Public API ---------------

  async startLocalMedia(constraints: MediaStreamConstraints = { audio: true, video: true }): Promise<MediaStream> {
    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    return this.localStream;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  setMicEnabled(enabled: boolean): void {
    this.localStream?.getAudioTracks().forEach((t) => (t.enabled = enabled));
  }

  setCameraEnabled(enabled: boolean): void {
    this.localStream?.getVideoTracks().forEach((t) => (t.enabled = enabled));
  }

  /** Initiator side: create RTCPeerConnection, attach tracks, send offer. */
  async call(peerId: string): Promise<void> {
    const entry = this.ensurePeer(peerId);
    const offer = await entry.pc.createOffer();
    await entry.pc.setLocalDescription(offer);
    this.opts.callbacks.sendSignal('signal:offer', {
      roomId: this.opts.roomId,
      toUserId: peerId,
      data: offer,
    });
  }

  /** Receiver side: handle incoming offer/answer/ice envelope. */
  async handleSignal(
    event: 'signal:offer' | 'signal:answer' | 'signal:ice',
    payload: SignalingPayload,
  ): Promise<void> {
    const peerId = this.peerIdFromPayload(payload);
    if (!peerId) return;

    if (event === 'signal:offer') {
      await this.handleOffer(peerId, payload.data as RTCSessionDescriptionInit);
    } else if (event === 'signal:answer') {
      await this.handleAnswer(peerId, payload.data as RTCSessionDescriptionInit);
    } else {
      await this.handleIce(peerId, payload.data as RTCIceCandidateInit);
    }
  }

  closePeer(peerId: string): void {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    entry.pc.close();
    this.peers.delete(peerId);
    this.opts.callbacks.onPeerClosed?.(peerId);
  }

  closeAll(): void {
    for (const peerId of [...this.peers.keys()]) this.closePeer(peerId);
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
  }

  /**
   * Hard reconnect: close every peer connection and re-initiate calls to peers
   * for which this client should be the offer-side (lower selfUserId per
   * lexicographic convention). Cheaper alternative to ICE-restart; works when
   * SDP renegotiation gets stuck. Local media stream is preserved.
   */
  restartAll(knownPeerIds: string[]): void {
    for (const peerId of [...this.peers.keys()]) this.closePeer(peerId);
    setTimeout(() => {
      for (const peerId of knownPeerIds) {
        if (peerId !== this.opts.selfUserId && this.opts.selfUserId < peerId) {
          void this.call(peerId);
        }
      }
    }, 200);
  }

  // --------------- Internals ---------------

  private ensurePeer(peerId: string): PeerEntry {
    const existing = this.peers.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const entry: PeerEntry = { pc, pendingCandidates: [], remoteDescriptionSet: false };

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) pc.addTrack(track, this.localStream);
    }

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      this.opts.callbacks.sendSignal('signal:ice', {
        roomId: this.opts.roomId,
        toUserId: peerId,
        data: ev.candidate.toJSON(),
      });
    };

    pc.ontrack = (ev) => {
      const [stream] = ev.streams;
      if (stream) this.opts.callbacks.onRemoteStream(peerId, stream);
    };

    pc.onconnectionstatechange = () => {
      this.opts.callbacks.onConnectionStateChange?.(peerId, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.closePeer(peerId);
      }
    };

    this.peers.set(peerId, entry);
    return entry;
  }

  private peerIdFromPayload(payload: SignalingPayload): string | null {
    // Server forwards original sender's userId via socket auth — but the
    // WSS envelope carries `toUserId` (us). The peer id is encoded as the
    // *sender* in the proxy: we cannot read it from the payload directly,
    // so the upstream socket listener wraps the call with the sender id.
    // For symmetry with the server contract (§2.16.3) we accept payloads
    // already tagged with `toUserId === selfUserId` and use a sentinel
    // `peerId` field set by the caller — see `socket.ts` listener.
    const peerId = (payload as SignalingPayload & { fromUserId?: string }).fromUserId;
    return peerId ?? null;
  }

  private async handleOffer(peerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const entry = this.ensurePeer(peerId);
    try {
      await entry.pc.setRemoteDescription(sdp);
    } catch (err) {
      // Renegotiation race after restartAll: SDP m-line / RTP extension IDs
      // can mismatch the stale RTCPeerConnection. Drop this peer; caller can
      // re-call() with a fresh PC.
      this.closePeer(peerId);
      this.opts.callbacks.onNegotiationError?.(peerId, err as Error);
      return;
    }
    entry.remoteDescriptionSet = true;
    await this.flushPendingCandidates(entry);
    const answer = await entry.pc.createAnswer();
    await entry.pc.setLocalDescription(answer);
    this.opts.callbacks.sendSignal('signal:answer', {
      roomId: this.opts.roomId,
      toUserId: peerId,
      data: answer,
    });
  }

  private async handleAnswer(peerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    try {
      await entry.pc.setRemoteDescription(sdp);
    } catch (err) {
      this.closePeer(peerId);
      this.opts.callbacks.onNegotiationError?.(peerId, err as Error);
      return;
    }
    entry.remoteDescriptionSet = true;
    await this.flushPendingCandidates(entry);
  }

  private async handleIce(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const entry = this.ensurePeer(peerId);
    if (!entry.remoteDescriptionSet) {
      entry.pendingCandidates.push(candidate);
      return;
    }
    await entry.pc.addIceCandidate(candidate);
  }

  private async flushPendingCandidates(entry: PeerEntry): Promise<void> {
    for (const c of entry.pendingCandidates) {
      await entry.pc.addIceCandidate(c);
    }
    entry.pendingCandidates.length = 0;
  }
}
