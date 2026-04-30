import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { RoomDTO, RoomMemberDTO, CreateRoomRequest } from '@vtt/shared';
import { apiFetch } from '../api/apiFetch';

interface RoomState {
  currentRoom: RoomDTO | null;
  ownRooms: RoomDTO[];
  members: RoomMemberDTO[];
  status: 'idle' | 'loading' | 'loaded' | 'error';
  error: string | null;
}

const initialState: RoomState = {
  currentRoom: null,
  ownRooms: [],
  members: [],
  status: 'idle',
  error: null,
};

export const fetchRooms = createAsyncThunk<RoomDTO[], void, { rejectValue: string }>(
  'room/fetchRooms',
  async (_, { rejectWithValue }) => {
    try {
      return await apiFetch<RoomDTO[]>('/api/rooms');
    } catch (err) {
      return rejectWithValue(
        err instanceof Error ? err.message : 'Не вдалося завантажити кімнати',
      );
    }
  },
);

export const createRoom = createAsyncThunk<RoomDTO, CreateRoomRequest, { rejectValue: string }>(
  'room/createRoom',
  async (payload, { rejectWithValue }) => {
    try {
      return await apiFetch<RoomDTO>('/api/rooms', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (err) {
      return rejectWithValue(
        err instanceof Error ? err.message : 'Не вдалося створити кімнату',
      );
    }
  },
);

export const fetchRoom = createAsyncThunk<RoomDTO, string, { rejectValue: string }>(
  'room/fetchRoom',
  async (roomId, { rejectWithValue }) => {
    try {
      return await apiFetch<RoomDTO>(`/api/rooms/${roomId}`);
    } catch (err) {
      return rejectWithValue(
        err instanceof Error ? err.message : 'Не вдалося завантажити кімнату',
      );
    }
  },
);

const roomSlice = createSlice({
  name: 'room',
  initialState,
  reducers: {
    setCurrentRoom: (state, action: PayloadAction<RoomDTO>) => {
      state.currentRoom = action.payload;
      state.members = action.payload.members;
      state.status = 'loaded';
    },
    clearRoom: (state) => {
      state.currentRoom = null;
      state.members = [];
      state.status = 'idle';
      state.error = null;
    },
    updateMembers: (state, action: PayloadAction<RoomMemberDTO[]>) => {
      state.members = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRooms.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchRooms.fulfilled, (state, action) => {
        state.status = 'loaded';
        state.ownRooms = action.payload;
      })
      .addCase(fetchRooms.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.payload ?? 'Помилка завантаження';
      })
      .addCase(createRoom.fulfilled, (state, action) => {
        state.ownRooms.push(action.payload);
      })
      .addCase(createRoom.rejected, (state, action) => {
        state.error = action.payload ?? 'Помилка створення';
      })
      .addCase(fetchRoom.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchRoom.fulfilled, (state, action) => {
        state.status = 'loaded';
        state.currentRoom = action.payload;
        state.members = action.payload.members;
      })
      .addCase(fetchRoom.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.payload ?? 'Помилка завантаження';
      });
  },
});

export const { setCurrentRoom, clearRoom, updateMembers } = roomSlice.actions;
export default roomSlice.reducer;
