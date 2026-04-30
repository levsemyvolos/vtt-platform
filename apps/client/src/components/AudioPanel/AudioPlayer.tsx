import { useEffect, useRef } from 'react';
import { useAppSelector } from '../../store';
import { AUDIO_FADE_MS } from '../../store/audio';
import { getAudioPlaybackUrl } from '../../api/audio';

/**
 * Headless `<audio>` host that reacts to the latest `audio:play` payload from
 * the server. Fade-in / fade-out is implemented through the Web Audio API
 * `GainNode.gain.setValueAtTime` ramp — the fade duration is a client UI
 * constant (`AUDIO_FADE_MS`) and is never transported over the wire (Q1).
 *
 * The component renders no visible UI; it lives mounted next to `AudioPanel`
 * inside `Sidebar` so playback survives tab switches.
 */
export default function AudioPlayer(): JSX.Element {
  const current = useAppSelector((s) => s.audio.current);
  const volume = useAppSelector((s) => s.audio.volume);
  const tracks = useAppSelector((s) => s.audio.tracks);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const lastTrackRef = useRef<string | null>(null);

  // Lazy-build the AudioContext + GainNode chain. Web Audio requires a user
  // gesture before resume(); we still create the graph here and call resume
  // once we attempt to play.
  function ensureGraph(audio: HTMLAudioElement): { ctx: AudioContext; gain: GainNode } {
    if (ctxRef.current && gainRef.current) {
      return { ctx: ctxRef.current, gain: gainRef.current };
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    const gain = ctx.createGain();
    const source = ctx.createMediaElementSource(audio);
    source.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = 0;
    ctxRef.current = ctx;
    gainRef.current = gain;
    sourceRef.current = source;
    return { ctx, gain };
  }

  // Fade gain → target over AUDIO_FADE_MS using setValueAtTime + linearRampToValueAtTime.
  function rampGain(ctx: AudioContext, gain: GainNode, target: number): void {
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(target, now + AUDIO_FADE_MS / 1000);
  }

  // Update volume immediately (no fade) — user-facing slider should feel snappy.
  useEffect(() => {
    const gain = gainRef.current;
    const ctx = ctxRef.current;
    if (!gain || !ctx) return;
    if (current && current.action !== 'stop') {
      gain.gain.setValueAtTime(volume, ctx.currentTime);
    }
  }, [volume, current]);

  // React to `audio:play` payloads.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!current) return;

    if (current.action === 'stop') {
      const ctx = ctxRef.current;
      const gain = gainRef.current;
      if (ctx && gain) {
        rampGain(ctx, gain, 0);
        // Pause after fade finishes; without this the buffer keeps decoding silently.
        const t = window.setTimeout(() => {
          audio.pause();
        }, AUDIO_FADE_MS);
        return () => window.clearTimeout(t);
      }
      audio.pause();
      return;
    }

    const trackMaybe = tracks.find((t) => t.id === current.trackId);
    if (!trackMaybe) return;
    const track = trackMaybe;

    let cancelled = false;

    async function play(): Promise<void> {
      // Re-mint the URL: the one in the DTO has TTL 15 min and may be stale
      // when the user joins a long-running session.
      let url = track.url;
      try {
        const fresh = await getAudioPlaybackUrl(track.id);
        url = fresh.url;
      } catch {
        // fall back to whatever URL we have in store
      }
      if (cancelled || !audio) return;

      const { ctx, gain } = ensureGraph(audio);
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch {
          // resume() requires a gesture in some browsers — silently skip.
        }
      }
      if (lastTrackRef.current !== track.id) {
        audio.src = url;
        audio.loop = track.loop;
        lastTrackRef.current = track.id;
      } else {
        audio.loop = track.loop;
      }
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      try {
        await audio.play();
      } catch {
        // Browser blocked autoplay until a gesture; the next play attempt
        // (after a click anywhere) will succeed.
        return;
      }
      rampGain(ctx, gain, volume);
    }

    void play();
    return () => {
      cancelled = true;
    };
    // `tracks` is a dep because we look up the URL in it.
  }, [current, tracks, volume]);

  return (
    <audio
      ref={audioRef}
      data-testid="audio-player"
      preload="auto"
      crossOrigin="anonymous"
    />
  );
}
