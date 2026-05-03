import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { RoomDTO, RoomMemberDTO, CreateRoomRequest } from '@vtt/shared';
import { apiFetch } from '../api/apiFetch';

interface UpdateRoomPayload {
  id: string;
  name?: string;
  gameSystem?: string;
}

interface RoomState {
  currentRoom: RoomDTO | null;
  ownRooms: RoomDTO[];
  members: RoomMemberDTO[];
  status: 'idle' | 'loading' | 'loaded' | 'error';
  error: string | null;
  sessionActive: boolean;
  editingSceneId: string | null;
}

const initialState: RoomState = {
  currentRoom: null,
  ownRooms: [],
  members: [],
  status: 'idle',
  error: null,
  sessionActive: false,
  editingSceneId: null,
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

export const updateRoom = createAsyncThunk<RoomDTO, UpdateRoomPayload, { rejectValue: string }>(
  'room/updateRoom',
  async ({ id, ...body }, { rejectWithValue }) => {
    try {
      return await apiFetch<RoomDTO>(`/api/rooms/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    } catch (err) {
      return rejectWithValue(
        err instanceof Error ? err.message : 'Не вдалося оновити кімнату',
      );
    }
  },
);

export const deleteRoom = createAsyncThunk<string, string, { rejectValue: string }>(
  'room/deleteRoom',
  async (roomId, { rejectWithValue }) => {
    try {
      await apiFetch<{ deleted: boolean }>(`/api/rooms/${roomId}`, { method: 'DELETE' });
      return roomId;
    } catch (err) {
      return rejectWithValue(
        err instanceof Error ? err.message : 'Не вдалося видалити кімнату',
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
      state.sessionActive = false;
    },
    updateMembers: (state, action: PayloadAction<RoomMemberDTO[]>) => {
      state.members = action.payload;
    },
    /** Wave 2.1 — upsert a single member from room:member-joined WS event. */
    upsertRoomMember: (state, action: PayloadAction<RoomMemberDTO>) => {
      const idx = state.members.findIndex((m) => m.userId === action.payload.userId);
      if (idx >= 0) {
        state.members[idx] = action.payload;
      } else {
        state.members.push(action.payload);
      }
    },
    startSession: (state) => {
      state.sessionActive = true;
    },
    startEditing: (state, action: PayloadAction<string>) => {
      state.editingSceneId = action.payload;
    },
    stopEditing: (state) => {
      state.editingSceneId = null;
    },
    /** Remove a room from ownRooms (e.g. after WS room:deleted event). */
    removeRoom: (state, action: PayloadAction<string>) => {
      state.ownRooms = state.ownRooms.filter((r) => r.id !== action.payload);
      if (state.currentRoom?.id === action.payload) {
        state.currentRoom = null;
        state.members = [];
        state.sessionActive = false;
      }
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
      })
      .addCase(updateRoom.fulfilled, (state, action) => {
        const idx = state.ownRooms.findIndex((r) => r.id === action.payload.id);
        if (idx >= 0) state.ownRooms[idx] = action.payload;
        if (state.currentRoom?.id === action.payload.id) {
          state.currentRoom = action.payload;
        }
      })
      .addCase(updateRoom.rejected, (state, action) => {
        state.error = action.payload ?? 'Помилка оновлення';
      })
      .addCase(deleteRoom.fulfilled, (state, action) => {
        state.ownRooms = state.ownRooms.filter((r) => r.id !== action.payload);
        if (state.currentRoom?.id === action.payload) {
          state.currentRoom = null;
          state.members = [];
          state.sessionActive = false;
        }
      })
      .addCase(deleteRoom.rejected, (state, action) => {
        state.error = action.payload ?? 'Помилка видалення';
      });
  },
});

export const { setCurrentRoom, clearRoom, updateMembers, upsertRoomMember, startSession, startEditing, stopEditing, removeRoom } = roomSlice.actions;
export default roomSlice.reducer;
