import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import sessionReducer from './session';
import roomReducer from './room';
import sceneReducer from './scene';
import scenesReducer from './scenes';
import chatReducer from './chat';
import initiativeReducer from './initiative';
import mediaReducer from './media';
import handoutsReducer from './handouts';
import notesReducer from './notes';
import charactersReducer from './characters';
import audioReducer from './audio';
import membersReducer from './members';
import assistantReducer from './assistant';
import annotationsReducer from './annotations';
import preferencesReducer from './preferences';

export const store = configureStore({
  reducer: {
    session: sessionReducer,
    room: roomReducer,
    scene: sceneReducer,
    scenes: scenesReducer,
    chat: chatReducer,
    initiative: initiativeReducer,
    media: mediaReducer,
    handouts: handoutsReducer,
    notes: notesReducer,
    characters: charactersReducer,
    audio: audioReducer,
    members: membersReducer,
    assistant: assistantReducer,
    annotations: annotationsReducer,
    preferences: preferencesReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
