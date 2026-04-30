import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import sessionReducer from './session';
import roomReducer from './room';
import sceneReducer from './scene';
import chatReducer from './chat';
import initiativeReducer from './initiative';

export const store = configureStore({
  reducer: {
    session: sessionReducer,
    room: roomReducer,
    scene: sceneReducer,
    chat: chatReducer,
    initiative: initiativeReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
