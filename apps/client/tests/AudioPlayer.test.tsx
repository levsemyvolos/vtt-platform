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
}));

import audioReducer, { applyAudioPlay, loadAudioTracks } from '../src/store/audio';
import AudioPlayer from '../src/components/AudioPanel/AudioPlayer';

interface MockedAudio extends HTMLAudioElement {
  __playMock: ReturnType<typeof vi.fn>;
  __pauseMock: ReturnType<typeof vi.fn>;
}

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
  createdAt: new Date().toISOString(),
};

function buildStore() {
  const store = configureStore({ reducer: { audio: audioReducer } });
  // Hydrate the slice with one track without going through the network.
  store.dispatch({
    type: loadAudioTracks.fulfilled.type,
    payload: [TRACK],
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
          action: 'play',
          trackId: 'track-1',
          sceneId: 'scene-1',
          loop: true,
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
          action: 'play',
          trackId: 'track-1',
          sceneId: 'scene-1',
          loop: true,
          startedAt: Date.now(),
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      store.dispatch(applyAudioPlay({ action: 'stop', startedAt: Date.now() }));
    });
    // Fade window (AUDIO_FADE_MS = 1500) must elapse before pause fires.
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(pauseMock).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
