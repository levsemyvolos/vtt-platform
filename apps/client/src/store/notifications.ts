import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SidebarTab } from '../components/GameRoom/types';

type Counts = Partial<Record<SidebarTab, number>>;

interface NotificationsState {
  unreadByTab: Counts;
  soundMuted: boolean;
  /** Mirror of GameRoom local sidebarTab state — kept in Redux so socket
   *  listeners can decide whether to bump a badge or skip (when user is
   *  already viewing the relevant tab). Updated via setActiveTab. */
  activeTab: SidebarTab | null;
}

const initialState: NotificationsState = {
  unreadByTab: {},
  soundMuted: false,
  activeTab: null,
};

const slice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    bumpTab(state, action: PayloadAction<SidebarTab>) {
      state.unreadByTab[action.payload] = (state.unreadByTab[action.payload] ?? 0) + 1;
    },
    clearTab(state, action: PayloadAction<SidebarTab>) {
      delete state.unreadByTab[action.payload];
    },
    toggleSoundMuted(state) {
      state.soundMuted = !state.soundMuted;
    },
    setActiveTab(state, action: PayloadAction<SidebarTab | null>) {
      state.activeTab = action.payload;
    },
  },
});

export const { bumpTab, clearTab, toggleSoundMuted, setActiveTab } = slice.actions;
export default slice.reducer;
