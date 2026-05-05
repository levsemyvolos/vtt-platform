import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { RoomDTO, RoomMemberDTO, CreateRoomRequest } from '@vtt/shared';
import { apiFetch } from '../api/apiFetch';
import { addToast } from './toast';

// B6-BUG-002: typed query option types for fetchRooms.
export type SortField = 'lastActive' | 'created' | 'name';
export type SortOrder = 'asc' | 'desc';
export type RoomFilter = 'owned' | 'invited' | 'all';

export interface FetchRoomsOpts {
  sort?: SortField;
  order?: SortOrder;
  filter?: RoomFilter;
}

/** localStorage key used to persist the active room ID across page reloads (BUG-001-F5). */
const PERSISTED_ROOM_KEY = 'vtt_current_room_id';

/** Returns the persisted room ID from localStorage, or null if none. */
export function getPersistedRoomId(): string | null {
  try {
    return localStorage.getItem(PERSISTED_ROOM_KEY);
  } catch {
    return null;
  }
}

function saveRoomId(id: string): void {
  try { localStorage.setItem(PERSISTED_ROOM_KEY, id); } catch { /* ignore */ }
}

function clearRoomId(): void {
  try { localStorage.removeItem(PERSISTED_ROOM_KEY); } catch { /* ignore */ }
}

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

export const fetchRooms = createAsyncThunk<RoomDTO[], FetchRoomsOpts | undefined, { rejectValue: string }>(
  'room/fetchRooms',
  async (opts, { rejectWithValue }) => {
    try {
      // B6-BUG-002: pass sort/order/filter as query params so server-side sort is applied.
      const params = new URLSearchParams();
      if (opts?.sort) params.set('sort', opts.sort);
      if (opts?.order) params.set('order', opts.order);
      if (opts?.filter) params.set('filter', opts.filter);
      const query = params.size > 0 ? `?${params.toString()}` : '';
      return await apiFetch<RoomDTO[]>(`/api/rooms${query}`);
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
  async ({ id, ...body }, { dispatch, rejectWithValue }) => {
    try {
      const room = await apiFetch<RoomDTO>(`/api/rooms/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      // B6-MIN-001: success toast after rename
      dispatch(addToast('success', 'room:edit.success'));
      return room;
    } catch (err) {
      return rejectWithValue(
        err instanceof Error ? err.message : 'Не вдалося оновити кімнату',
      );
    }
  },
);

export const deleteRoom = createAsyncThunk<string, string, { rejectValue: string }>(
  'room/deleteRoom',
  async (roomId, { dispatch, rejectWithValue }) => {
    try {
      await apiFetch<{ deleted: boolean }>(`/api/rooms/${roomId}`, { method: 'DELETE' });
      // B6-MIN-002: success toast after delete
      dispatch(addToast('success', 'room:delete.success'));
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
      state.sessionActive = action.payload.status === 'active';
      // BUG-001-F5: persist room ID so F5 can restore lobby navigation.
      saveRoomId(action.payload.id);
    },
    clearRoom: (state) => {
      state.currentRoom = null;
      state.members = [];
      state.status = 'idle';
      state.error = null;
      state.sessionActive = false;
      // BUG-001-F5: clear persisted room ID when user leaves the room.
      clearRoomId();
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
    /** Moderation — remove a kicked member from local roster. */
    removeRoomMember: (state, action: PayloadAction<string>) => {
      state.members = state.members.filter((m) => m.userId !== action.payload);
    },
    /** WS room:updated — sync room name/gameSystem changes from GM to all clients. */
    applyRoomUpdate: (state, action: PayloadAction<{ roomId: string; name: string; gameSystem: string }>) => {
      if (state.currentRoom?.id === action.payload.roomId) {
        state.currentRoom.name = action.payload.name;
        state.currentRoom.gameSystem = action.payload.gameSystem;
      }
      const idx = state.ownRooms.findIndex((r) => r.id === action.payload.roomId);
      if (idx >= 0) {
        state.ownRooms[idx]!.name = action.payload.name;
        state.ownRooms[idx]!.gameSystem = action.payload.gameSystem;
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
        clearRoomId();
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
        state.sessionActive = action.payload.status === 'active';
        // BUG-001-F5: keep localStorage in sync when fetchRoom restores the room.
        saveRoomId(action.payload.id);
      })
      .addCase(fetchRoom.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.payload ?? 'Помилка завантаження';
        // BUG-001-F5: room no longer accessible (deleted/forbidden) — clear stale persisted ID.
        clearRoomId();
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
          clearRoomId();
        }
      })
      .addCase(deleteRoom.rejected, (state, action) => {
        state.error = action.payload ?? 'Помилка видалення';
      });
  },
});

export const { setCurrentRoom, clearRoom, updateMembers, upsertRoomMember, removeRoomMember, applyRoomUpdate, startSession, startEditing, stopEditing, removeRoom } = roomSlice.actions;
export default roomSlice.reducer;
