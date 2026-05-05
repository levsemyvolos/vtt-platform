import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface RemotePeerState {
  userId: string;
  /** True once the peer's first MediaStreamTrack has been received. */
  hasStream: boolean;
  connectionState: RTCPeerConnectionState;
  /** Round-trip time in ms from WebRTC stats (updated every 5 s). */
  rttMs?: number;
}

interface MediaState {
  micEnabled: boolean;
  cameraEnabled: boolean;
  localStreamReady: boolean;
  callJoined: boolean;
  peers: Record<string, RemotePeerState>;
  meshCeilingReached: boolean;
  /** Display order for remote peer tiles. Append-only; removePeer filters it. */
  peerOrder: string[];
  /** Peers pinned to the top of the camera column (local-only). */
  pinnedPeerIds: string[];
  /** UserIds whose audio is currently above the VAD threshold. */
  speakingPeerIds: string[];
}

const PEER_ORDER_KEY = 'vtt.peerOrder';
const PINNED_KEY = 'vtt.pinnedPeers';

function loadPeerOrder(): string[] {
  try {
    const raw = localStorage.getItem(PEER_ORDER_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function loadPinned(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

const initialState: MediaState = {
  micEnabled: false,
  cameraEnabled: false,
  localStreamReady: false,
  callJoined: false,
  peers: {},
  meshCeilingReached: false,
  peerOrder: loadPeerOrder(),
  pinnedPeerIds: loadPinned(),
  speakingPeerIds: [],
};

const mediaSlice = createSlice({
  name: 'media',
  initialState,
  reducers: {
    setLocalStreamReady: (state, action: PayloadAction<boolean>) => {
      state.localStreamReady = action.payload;
    },
    toggleMic: (state) => {
      state.micEnabled = !state.micEnabled;
    },
    toggleCamera: (state) => {
      state.cameraEnabled = !state.cameraEnabled;
    },
    setMicEnabled: (state, action: PayloadAction<boolean>) => {
      state.micEnabled = action.payload;
    },
    setCameraEnabled: (state, action: PayloadAction<boolean>) => {
      state.cameraEnabled = action.payload;
    },
    upsertPeer: (state, action: PayloadAction<RemotePeerState>) => {
      const { userId } = action.payload;
      state.peers[userId] = action.payload;
      if (!state.peerOrder.includes(userId)) {
        state.peerOrder.push(userId);
        localStorage.setItem(PEER_ORDER_KEY, JSON.stringify(state.peerOrder));
      }
    },
    removePeer: (state, action: PayloadAction<string>) => {
      const id = action.payload;
      delete state.peers[id];
      state.peerOrder = state.peerOrder.filter((uid) => uid !== id);
      state.pinnedPeerIds = state.pinnedPeerIds.filter((uid) => uid !== id);
      localStorage.setItem(PEER_ORDER_KEY, JSON.stringify(state.peerOrder));
      localStorage.setItem(PINNED_KEY, JSON.stringify(state.pinnedPeerIds));
    },
    setMeshCeiling: (state, action: PayloadAction<boolean>) => {
      state.meshCeilingReached = action.payload;
    },
    setCallJoined: (state, action: PayloadAction<boolean>) => {
      state.callJoined = action.payload;
    },
    /** Reorder peer tiles (result of a drag-and-drop). */
    reorderPeers: (state, action: PayloadAction<string[]>) => {
      state.peerOrder = action.payload;
      localStorage.setItem(PEER_ORDER_KEY, JSON.stringify(action.payload));
    },
    togglePinPeer: (state, action: PayloadAction<string>) => {
      const id = action.payload;
      const idx = state.pinnedPeerIds.indexOf(id);
      if (idx === -1) {
        state.pinnedPeerIds.push(id);
      } else {
        state.pinnedPeerIds.splice(idx, 1);
      }
      localStorage.setItem(PINNED_KEY, JSON.stringify(state.pinnedPeerIds));
    },
    setPeerRtt: (state, action: PayloadAction<{ userId: string; rttMs: number }>) => {
      const peer = state.peers[action.payload.userId];
      if (peer) peer.rttMs = action.payload.rttMs;
    },
    setSpeaking: (state, action: PayloadAction<{ userId: string; speaking: boolean }>) => {
      const { userId, speaking } = action.payload;
      const idx = state.speakingPeerIds.indexOf(userId);
      if (speaking && idx === -1) state.speakingPeerIds.push(userId);
      else if (!speaking && idx !== -1) state.speakingPeerIds.splice(idx, 1);
    },
    resetMedia: () => ({
      ...initialState,
      peerOrder: loadPeerOrder(),
      pinnedPeerIds: loadPinned(),
      speakingPeerIds: [],
    }),
  },
});

export const {
  setLocalStreamReady,
  toggleMic,
  toggleCamera,
  setMicEnabled,
  setCameraEnabled,
  upsertPeer,
  removePeer,
  setMeshCeiling,
  setCallJoined,
  reorderPeers,
  togglePinPeer,
  setPeerRtt,
  setSpeaking,
  resetMedia,
} = mediaSlice.actions;
export default mediaSlice.reducer;
