import type { IceServer, SignalingPayload } from '@vtt/shared';

type SignalSender = (
  event: 'signal:offer' | 'signal:answer' | 'signal:ice',
  payload: SignalingPayload,
) => void;

export interface PeerManagerCallbacks {
  sendSignal: SignalSender;
  onRemoteStream: (peerId: string, stream: MediaStream) => void;
  onConnectionStateChange?: (peerId: string, state: RTCPeerConnectionState) => void;
  onPeerClosed?: (peerId: string) => void;
  onNegotiationError?: (peerId: string, err: Error) => void;
  /** Called every RTT_INTERVAL_MS with the latest round-trip time for a peer. */
  onRttUpdate?: (peerId: string, rttMs: number) => void;
}

export interface PeerManagerOptions {
  selfUserId: string;
  roomId: string;
  iceServers: IceServer[];
  callbacks: PeerManagerCallbacks;
}

const RTT_INTERVAL_MS = 5000;
const ICE_RESTART_FALLBACK_MS = 5000;

interface PeerEntry {
  pc: RTCPeerConnection;
  rttInterval: ReturnType<typeof setInterval> | null;
  /** Perfect Negotiation: true while createOffer→setLocalDescription is pending. */
  makingOffer: boolean;
  /** Perfect Negotiation: true if we lost glare resolution and must drop the offer. */
  ignoreOffer: boolean;
  /** Stable polite/impolite role per W3C Perfect Negotiation pattern. */
  polite: boolean;
  /** Timer for two-stage failed-state recovery (ICE restart → hard reconnect). */
  recoveryTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * Mesh WebRTC peer manager. Implements the W3C Perfect Negotiation Pattern
 * (https://www.w3.org/TR/webrtc/#perfect-negotiation-example) so SDP renegotiation
 * is glare-safe (simultaneous offers from both sides resolve deterministically).
 *
 * Connection recovery is two-stage:
 *   1. On `connectionState='failed'` → `pc.restartIce()` (preserves SDP m-section
 *      structure, avoids RTP extension ID reassignment errors).
 *   2. If still failed after 5 s → close + ensurePeer (full reconnect via
 *      onnegotiationneeded).
 *
 * Polite/impolite role is fixed per pair (lex-greater userId = polite). The
 * polite peer rolls back its in-progress offer on glare; the impolite peer
 * keeps its offer.
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

  /**
   * Ensure a peer connection exists for `peerId`. Triggers `onnegotiationneeded`
   * which sends the offer through perfect negotiation. Safe to call multiple times.
   */
  call(peerId: string): void {
    this.ensurePeer(peerId);
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
      await this.handleIce(peerId, payload.data as RTCIceCandidateInit | null);
    }
  }

  closePeer(peerId: string): void {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    if (entry.rttInterval) clearInterval(entry.rttInterval);
    if (entry.recoveryTimer) clearTimeout(entry.recoveryTimer);
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
   * Soft reconnect: trigger ICE restart on every active peer. Preserves SDP
   * structure — avoids the RTP extension ID reassignment errors that plagued
   * the previous closeAll-then-recall approach.
   */
  reconnectAll(): void {
    for (const [, entry] of this.peers) {
      try {
        entry.pc.restartIce();
      } catch {
        // ignore — failure handler will pick it up
      }
    }
  }

  /**
   * Hard reconnect that mimics F5: close every existing peer and re-call all
   * known members where this side is the lex-lower initiator. Used by the
   * Reconnect button when ICE-restart alone isn't enough — e.g. peers that
   * never connected on first try, or members who joined with no peer entry.
   *
   * Lex-higher side re-creates entries lazily on incoming offer (handleSignal),
   * so we only initiate from the lex-lower side here. Perfect Negotiation
   * resolves any glare with the other side.
   */
  fullReconnect(memberIds: readonly string[]): void {
    for (const peerId of [...this.peers.keys()]) this.closePeer(peerId);
    for (const peerId of memberIds) {
      if (peerId === this.opts.selfUserId) continue;
      if (this.opts.selfUserId < peerId) this.ensurePeer(peerId);
    }
  }

  /** Snapshot of peers currently tracked (for reconnect bookkeeping). */
  getKnownPeerIds(): string[] {
    return [...this.peers.keys()];
  }

  // --------------- Internals ---------------

  private isPolite(peerId: string): boolean {
    // Lex-greater userId is polite (yields on glare). Symmetric and stable.
    return this.opts.selfUserId > peerId;
  }

  private ensurePeer(peerId: string): PeerEntry {
    const existing = this.peers.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const entry: PeerEntry = {
      pc,
      rttInterval: null,
      makingOffer: false,
      ignoreOffer: false,
      polite: this.isPolite(peerId),
      recoveryTimer: null,
    };

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) pc.addTrack(track, this.localStream);
    }

    pc.onicecandidate = (ev) => {
      // null candidate = end-of-candidates per RFC 8829; forward it so the
      // remote peer can call addIceCandidate(null) to complete gathering.
      this.opts.callbacks.sendSignal('signal:ice', {
        roomId: this.opts.roomId,
        toUserId: peerId,
        data: ev.candidate ? ev.candidate.toJSON() : null,
      });
    };

    pc.ontrack = (ev) => {
      const [stream] = ev.streams;
      if (stream) this.opts.callbacks.onRemoteStream(peerId, stream);
    };

    // Perfect Negotiation: implicit createOffer + setLocalDescription.
    pc.onnegotiationneeded = async () => {
      try {
        entry.makingOffer = true;
        await pc.setLocalDescription();
        if (!pc.localDescription) return;
        this.opts.callbacks.sendSignal('signal:offer', {
          roomId: this.opts.roomId,
          toUserId: peerId,
          data: pc.localDescription,
        });
      } catch (err) {
        this.opts.callbacks.onNegotiationError?.(peerId, err as Error);
      } finally {
        entry.makingOffer = false;
      }
    };

    pc.onconnectionstatechange = () => {
      this.opts.callbacks.onConnectionStateChange?.(peerId, pc.connectionState);
      if (pc.connectionState === 'connected') {
        this.startRttPolling(peerId, entry);
        if (entry.recoveryTimer) {
          clearTimeout(entry.recoveryTimer);
          entry.recoveryTimer = null;
        }
      }
      if (pc.connectionState === 'failed') {
        this.handleFailed(peerId, entry);
      }
      if (pc.connectionState === 'closed') {
        this.closePeer(peerId);
      }
    };

    this.peers.set(peerId, entry);
    return entry;
  }

  /**
   * Two-stage recovery: ICE restart first; if still failed after 5 s, close
   * and re-create the peer connection (full SDP renegotiation).
   */
  private handleFailed(peerId: string, entry: PeerEntry): void {
    try {
      entry.pc.restartIce();
    } catch {
      // ignore
    }
    if (entry.recoveryTimer) clearTimeout(entry.recoveryTimer);
    entry.recoveryTimer = setTimeout(() => {
      const current = this.peers.get(peerId);
      if (!current) return;
      if (current.pc.connectionState === 'failed' || current.pc.connectionState === 'disconnected') {
        this.closePeer(peerId);
        // Only the impolite side re-initiates after full close to avoid double-call.
        if (!current.polite) this.ensurePeer(peerId);
      }
    }, ICE_RESTART_FALLBACK_MS);
  }

  private startRttPolling(peerId: string, entry: PeerEntry): void {
    if (entry.rttInterval) return;
    entry.rttInterval = setInterval(() => {
      void entry.pc.getStats().then((stats) => {
        stats.forEach((report) => {
          if (
            report.type === 'candidate-pair' &&
            (report as RTCIceCandidatePairStats).nominated &&
            (report as RTCIceCandidatePairStats).state === 'succeeded'
          ) {
            const rtt = (report as RTCIceCandidatePairStats).currentRoundTripTime;
            if (rtt !== undefined) {
              this.opts.callbacks.onRttUpdate?.(peerId, Math.round(rtt * 1000));
            }
          }
        });
      });
    }, RTT_INTERVAL_MS);
  }

  private peerIdFromPayload(payload: SignalingPayload): string | null {
    const peerId = (payload as SignalingPayload & { fromUserId?: string }).fromUserId;
    return peerId ?? null;
  }

  private async handleOffer(peerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const entry = this.ensurePeer(peerId);
    const pc = entry.pc;
    const offerCollision = entry.makingOffer || pc.signalingState !== 'stable';
    entry.ignoreOffer = !entry.polite && offerCollision;
    if (entry.ignoreOffer) return;

    try {
      // setRemoteDescription with implicit rollback on collision (polite side).
      await pc.setRemoteDescription(sdp);
      await pc.setLocalDescription(); // implicit createAnswer
      if (!pc.localDescription) return;
      this.opts.callbacks.sendSignal('signal:answer', {
        roomId: this.opts.roomId,
        toUserId: peerId,
        data: pc.localDescription,
      });
    } catch (err) {
      this.opts.callbacks.onNegotiationError?.(peerId, err as Error);
    }
  }

  private async handleAnswer(peerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    try {
      await entry.pc.setRemoteDescription(sdp);
    } catch (err) {
      this.opts.callbacks.onNegotiationError?.(peerId, err as Error);
    }
  }

  private async handleIce(peerId: string, candidate: RTCIceCandidateInit | null): Promise<void> {
    const entry = this.ensurePeer(peerId);
    try {
      // null = end-of-candidates signal; RTCIceCandidate() with no args is the
      // spec-correct way to consume it (addIceCandidate(null) is deprecated).
      await entry.pc.addIceCandidate(candidate ? new RTCIceCandidate(candidate) : new RTCIceCandidate());
    } catch (err) {
      // Tolerate ICE failures only when we're explicitly ignoring this offer.
      if (!entry.ignoreOffer) {
        // eslint-disable-next-line no-console
        console.warn('[PeerManager] addIceCandidate failed', err);
      }
    }
  }
}
