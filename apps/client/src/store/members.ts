import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { UserPublic } from '@vtt/shared';
import { getRoomMembers } from '../api/members';

interface RoomMembers {
  gm: UserPublic | null;
  players: UserPublic[];
  observers: UserPublic[];
}

interface MembersState {
  /** Keyed by roomId — cached on first load, refreshed on explicit reload. */
  byRoom: Record<string, RoomMembers>;
  status: Record<string, 'idle' | 'loading' | 'loaded' | 'error'>;
}

const initialState: MembersState = {
  byRoom: {},
  status: {},
};

export const loadMembers = createAsyncThunk<
  { roomId: string; members: RoomMembers },
  string,
  { rejectValue: string }
>('members/load', async (roomId, { rejectWithValue }) => {
  try {
    const data = await getRoomMembers(roomId);
    return {
      roomId,
      members: { gm: data.gm, players: data.players, observers: data.observers },
    };
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Помилка завантаження учасників');
  }
});

const membersSlice = createSlice({
  name: 'members',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadMembers.pending, (state, action) => {
        state.status[action.meta.arg] = 'loading';
      })
      .addCase(loadMembers.fulfilled, (state, action) => {
        const { roomId, members } = action.payload;
        state.byRoom[roomId] = members;
        state.status[roomId] = 'loaded';
      })
      .addCase(loadMembers.rejected, (state, action) => {
        state.status[action.meta.arg] = 'error';
      });
  },
});

export default membersSlice.reducer;
