import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { AudioTrackDTO } from '@vtt/shared';

vi.mock('../src/api/apiFetch', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}));
vi.mock('../src/api/audio', () => ({
  // We must keep `getAudioPlaybackUrl` mockable so the test doesn't hit network.
  getAudioPlaybackUrl: vi.fn(async (id: string) => ({ url: `https://signed.example/${id}` })),
  playAudioTrack: vi.fn().mockResolvedValue(undefined),
  stopAudioLayer: vi.fn().mockResolvedValue(undefined),
}));

import audioReducer, { applyAudioPlay, loadAudioTracks, playTrackThunk, stopLayerThunk } from '../src/store/audio';
import AudioPlayer from '../src/components/AudioPanel/AudioPlayer';

const playMock = vi.fn().mockResolvedValue(undefined);
const pauseMock = vi.fn();

beforeEach(() => {
  // Stub Web Audio API — jsdom does not implement it.
  class FakeGainNode {
    gain = {
      value: 0,
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    };
    connect = vi.fn();
  }
  class FakeMediaElementSource {
    connect = vi.fn();
  }
  class FakeAudioContext {
    state = 'running';
    currentTime = 0;
    destination = {};
    createGain(): FakeGainNode {
      return new FakeGainNode();
    }
    createMediaElementSource(): FakeMediaElementSource {
      return new FakeMediaElementSource();
    }
    resume(): Promise<void> {
      return Promise.resolve();
    }
  }
  // @ts-expect-error — assigning fake constructor to global window
  window.AudioContext = FakeAudioContext;

  // Stub HTMLMediaElement.play / pause so jsdom doesn't NotSupportedError.
  HTMLMediaElement.prototype.play = playMock as unknown as HTMLMediaElement['play'];
  HTMLMediaElement.prototype.pause = pauseMock as unknown as HTMLMediaElement['pause'];
});

afterEach(() => {
  cleanup();
  playMock.mockClear();
  pauseMock.mockClear();
});

const TRACK: AudioTrackDTO = {
  id: 'track-1',
  roomId: 'room-1',
  sceneId: 'scene-1',
  title: 'Tavern',
  url: 'https://stale.example/track-1',
  mimeType: 'audio/mpeg',
  loop: true,
  fadeMs: 1500,
  layer: 'music',
  createdAt: new Date().toISOString(),
};

const TRACK2: AudioTrackDTO = {
  id: 'track-2',
  roomId: 'room-1',
  sceneId: 'scene-1',
  title: 'Battle',
  url: 'https://stale.example/track-2',
  mimeType: 'audio/mpeg',
  loop: true,
  fadeMs: 1500,
  layer: 'music',
  createdAt: new Date().toISOString(),
};

function buildStore() {
  const store = configureStore({ reducer: { audio: audioReducer } });
  // Hydrate the slice with tracks without going through the network.
  store.dispatch({
    type: loadAudioTracks.fulfilled.type,
    payload: [TRACK, TRACK2],
  });
  return store;
}

describe('AudioPlayer (Ф6 client)', () => {
  it("calls audio.play() when 'audio:play' arrives via socket", async () => {
    const store = buildStore();
    render(
      <Provider store={store}>
        <AudioPlayer />
      </Provider>,
    );

    await act(async () => {
      store.dispatch(
        applyAudioPlay({
          kind: 'persistent',
          layer: 'music',
          action: 'play',
          trackId: 'track-1',
          sceneId: 'scene-1',
          loop: true,
          fadeMs: 1500,
          startedAt: Date.now(),
        }),
      );
      // Allow the async playback URL refresh inside the effect to flush.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(playMock).toHaveBeenCalled();
  });

  it("calls audio.pause() after a 'stop' action (post-fade timer)", async () => {
    vi.useFakeTimers();
    const store = buildStore();
    render(
      <Provider store={store}>
        <AudioPlayer />
      </Provider>,
    );

    await act(async () => {
      store.dispatch(
        applyAudioPlay({
          kind: 'persistent',
          layer: 'music',
          action: 'play',
          trackId: 'track-1',
          sceneId: 'scene-1',
          loop: true,
          fadeMs: 1500,
          startedAt: Date.now(),
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      store.dispatch(applyAudioPlay({
        kind: 'persistent',
        layer: 'music',
        action: 'stop',
        fadeMs: 1500,
        startedAt: Date.now(),
      }));
    });
    // Fade window (1500 ms) must elapse before pause fires.
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(pauseMock).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('calls audio.play() twice when switching track (A/B crossfade)', async () => {
    const store = buildStore();
    render(
      <Provider store={store}>
        <AudioPlayer />
      </Provider>,
    );

    // Play track-1 on slot A.
    await act(async () => {
      store.dispatch(
        applyAudioPlay({
          kind: 'persistent',
          layer: 'music',
          action: 'play',
          trackId: 'track-1',
          sceneId: 'scene-1',
          loop: true,
          fadeMs: 1500,
          startedAt: Date.now(),
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const firstCallCount = playMock.mock.calls.length;
    expect(firstCallCount).toBeGreaterThanOrEqual(1);

    // Switch to track-2 — should trigger play() on the inactive slot.
    await act(async () => {
      store.dispatch(
        applyAudioPlay({
          kind: 'persistent',
          layer: 'music',
          action: 'switch',
          trackId: 'track-2',
          sceneId: 'scene-1',
          loop: true,
          fadeMs: 1500,
          startedAt: Date.now(),
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(playMock.mock.calls.length).toBeGreaterThan(firstCallCount);
  });
});

describe('playTrackThunk / stopLayerThunk (T3 — fire-and-forget, no state change)', () => {
  it('playTrackThunk fulfilled does not change audio state', async () => {
    const store = buildStore();
    const before = store.getState().audio.tracks;

    await store.dispatch(playTrackThunk('track-1'));

    expect(store.getState().audio.tracks).toBe(before);
    expect(store.getState().audio.current.music).toBeNull();
  });

  it('stopLayerThunk fulfilled does not change audio state', async () => {
    const store = buildStore();

    await store.dispatch(stopLayerThunk({ roomId: 'room-1', layer: 'music' }));

    expect(store.getState().audio.current.music).toBeNull();
  });
});
