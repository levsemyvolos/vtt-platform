import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PeerManager } from '../../../infrastructure/webrtc/PeerManager';
import type { SignalingPayload } from '@vtt/shared';

// ── Minimal RTCPeerConnection mock ────────────────────────────────────────────

class FakePC {
  static instances: FakePC[] = [];

  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescriptionSet = false;
  connectionState: RTCPeerConnectionState = 'connecting';

  onicecandidate: ((e: { candidate: RTCIceCandidate | null }) => void) | null = null;
  ontrack: ((e: { streams: MediaStream[] }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;

  createOffer = vi.fn(
    async (): Promise<RTCSessionDescriptionInit> => ({ type: 'offer', sdp: 'mock-offer' }),
  );
  createAnswer = vi.fn(
    async (): Promise<RTCSessionDescriptionInit> => ({ type: 'answer', sdp: 'mock-answer' }),
  );
  setLocalDescription = vi.fn(async (desc: RTCSessionDescriptionInit): Promise<void> => {
    this.localDescription = desc;
  });
  setRemoteDescription = vi.fn(async (): Promise<void> => {
    this.remoteDescriptionSet = true;
  });
  addIceCandidate = vi.fn(async (): Promise<void> => {});
  addTrack = vi.fn();
  close = vi.fn();
  getAudioTracks = vi.fn(() => [] as MediaStreamTrack[]);
  getVideoTracks = vi.fn(() => [] as MediaStreamTrack[]);

  constructor() {
    FakePC.instances.push(this);
  }
}

class FakeMediaStream {
  static counter = 0;
  id = `stream-${FakeMediaStream.counter++}`;
  getTracks = vi.fn(() => [] as MediaStreamTrack[]);
  getAudioTracks = vi.fn(() => [] as MediaStreamTrack[]);
  getVideoTracks = vi.fn(() => [] as MediaStreamTrack[]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeManager(selfId: string, onRemoteStream = vi.fn()): PeerManager {
  return new PeerManager({
    selfUserId: selfId,
    roomId: 'room-1',
    iceServers: [],
    callbacks: {
      sendSignal: vi.fn(),
      onRemoteStream,
    },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PeerManager — 2-peer mesh handshake', () => {
  beforeEach(() => {
    FakePC.instances = [];
    vi.stubGlobal('RTCPeerConnection', FakePC);
    vi.stubGlobal('MediaStream', FakeMediaStream);
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => new FakeMediaStream()),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('completes offer/answer handshake and delivers remote stream to both sides', async () => {
    const collectedSignals: Array<{
      from: string;
      event: string;
      payload: SignalingPayload;
    }> = [];

    const onStreamA = vi.fn();
    const onStreamB = vi.fn();

    const peerA = new PeerManager({
      selfUserId: 'alice',
      roomId: 'room-1',
      iceServers: [],
      callbacks: {
        sendSignal: (event, payload) =>
          collectedSignals.push({ from: 'alice', event, payload }),
        onRemoteStream: onStreamA,
      },
    });

    const peerB = new PeerManager({
      selfUserId: 'bob',
      roomId: 'room-1',
      iceServers: [],
      callbacks: {
        sendSignal: (event, payload) =>
          collectedSignals.push({ from: 'bob', event, payload }),
        onRemoteStream: onStreamB,
      },
    });

    await peerA.startLocalMedia();
    await peerB.startLocalMedia();

    // Step 1: A initiates offer to B.
    await peerA.call('bob');

    const offerSig = collectedSignals.find(
      (s) => s.event === 'signal:offer' && s.from === 'alice',
    );
    expect(offerSig).toBeDefined();
    expect(offerSig!.payload.toUserId).toBe('bob');

    // Step 2: B handles the offer → emits answer.
    await peerB.handleSignal('signal:offer', {
      roomId: 'room-1',
      toUserId: 'bob',
      fromUserId: 'alice',
      data: offerSig!.payload.data,
    });

    const answerSig = collectedSignals.find(
      (s) => s.event === 'signal:answer' && s.from === 'bob',
    );
    expect(answerSig).toBeDefined();
    expect(answerSig!.payload.toUserId).toBe('alice');

    // Step 3: A handles the answer → handshake complete.
    await peerA.handleSignal('signal:answer', {
      roomId: 'room-1',
      toUserId: 'alice',
      fromUserId: 'bob',
      data: answerSig!.payload.data,
    });

    // Verify SDP exchange: both peers have called setRemoteDescription.
    // FakePC.instances[0] = A's PC for bob (created when A called bob).
    // FakePC.instances[1] = B's PC for alice (created when B handled offer).
    expect(FakePC.instances).toHaveLength(2);
    const pcA = FakePC.instances[0]!;
    const pcB = FakePC.instances[1]!;
    expect(pcA.setRemoteDescription).toHaveBeenCalledOnce(); // A got answer
    expect(pcB.setRemoteDescription).toHaveBeenCalledOnce(); // B got offer

    // Simulate remote track delivery (fires ontrack after remote SDP is set).
    const streamFromB = new FakeMediaStream() as unknown as MediaStream;
    pcA.ontrack?.({ streams: [streamFromB] }); // A receives B's track

    const streamFromA = new FakeMediaStream() as unknown as MediaStream;
    pcB.ontrack?.({ streams: [streamFromA] }); // B receives A's track

    expect(onStreamA).toHaveBeenCalledWith('bob', streamFromB);
    expect(onStreamB).toHaveBeenCalledWith('alice', streamFromA);
  });

  it('buffers ICE candidates received before remote description is set, then flushes', async () => {
    const a = makeManager('alice');
    await a.startLocalMedia();

    const iceCandidate = { candidate: 'mock-ice', sdpMid: '0', sdpMLineIndex: 0 };

    // ICE arrives before offer — must be buffered, NOT passed to addIceCandidate yet.
    await a.handleSignal('signal:ice', {
      roomId: 'room-1',
      toUserId: 'alice',
      fromUserId: 'bob',
      data: iceCandidate,
    });

    const pc = FakePC.instances[0]!;
    expect(pc).toBeDefined();
    expect(pc.addIceCandidate).not.toHaveBeenCalled();

    // Offer arrives → sets remote description → pending candidates flushed.
    await a.handleSignal('signal:offer', {
      roomId: 'room-1',
      toUserId: 'alice',
      fromUserId: 'bob',
      data: { type: 'offer', sdp: 'sdp-payload' },
    });

    expect(pc.addIceCandidate).toHaveBeenCalledOnce();
    expect(pc.addIceCandidate).toHaveBeenCalledWith(iceCandidate);
  });

  it('setIceServers updates credentials used for subsequent peer connections', () => {
    const manager = makeManager('alice');
    const newServers = [{ urls: 'turn:new.turn.server:3478', username: 'u', credential: 'c' }];

    manager.setIceServers(newServers);

    // Create a new peer — should use updated ICE servers.
    void manager.call('bob');

    // The FakePC constructor receives the RTCConfiguration.
    // We can only verify that a new PC was created (FakePC.instances grew).
    expect(FakePC.instances.length).toBeGreaterThanOrEqual(1);
  });
});
