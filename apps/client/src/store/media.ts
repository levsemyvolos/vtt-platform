import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface RemotePeerState {
  userId: string;
  /** True once the peer's first MediaStreamTrack has been received. */
  hasStream: boolean;
  connectionState: RTCPeerConnectionState;
}

interface MediaState {
  /** Local microphone state. */
  micEnabled: boolean;
  /** Local camera state. */
  cameraEnabled: boolean;
  /** True after getUserMedia has succeeded at least once. */
  localStreamReady: boolean;
  /** True after the user explicitly clicked "Connect to call". */
  callJoined: boolean;
  /** Keyed by remote userId. */
  peers: Record<string, RemotePeerState>;
  /** True when active peer count ≥ 6 (mesh O(N²) ceiling per §2.13.4). */
  meshCeilingReached: boolean;
}

const initialState: MediaState = {
  micEnabled: false,
  cameraEnabled: false,
  localStreamReady: false,
  callJoined: false,
  peers: {},
  meshCeilingReached: false,
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
    upsertPeer: (state, action: PayloadAction<RemotePeerState>) => {
      state.peers[action.payload.userId] = action.payload;
    },
    removePeer: (state, action: PayloadAction<string>) => {
      delete state.peers[action.payload];
    },
    setMeshCeiling: (state, action: PayloadAction<boolean>) => {
      state.meshCeilingReached = action.payload;
    },
    setCallJoined: (state, action: PayloadAction<boolean>) => {
      state.callJoined = action.payload;
    },
    resetMedia: () => initialState,
  },
});

export const {
  setLocalStreamReady,
  toggleMic,
  toggleCamera,
  upsertPeer,
  removePeer,
  setMeshCeiling,
  setCallJoined,
  resetMedia,
} = mediaSlice.actions;
export default mediaSlice.reducer;
