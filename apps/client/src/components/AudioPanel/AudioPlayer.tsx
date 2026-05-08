import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../store';
import { consumeSfx } from '../../store/audio';
import { getAudioPlaybackUrl } from '../../api/audio';
import type { AudioPlayPayload, AudioTrackDTO } from '@vtt/shared';

const SFX_POOL_SIZE = 5;

// ── Web Audio helpers ─────────────────────────────────────────────────────────

/** Lazily create and cache a shared AudioContext. */
function ensureCtx(ctxRef: React.MutableRefObject<AudioContext | null>): AudioContext {
  if (ctxRef.current) return ctxRef.current;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  ctxRef.current = new Ctor();
  return ctxRef.current;
}

interface GainSlot {
  gain: GainNode;
  source: MediaElementAudioSourceNode;
}

/**
 * Lazily wire an <audio> element into the Web Audio graph.
 * Returns null if the element is not yet mounted.
 */
function ensureSlot(
  audio: HTMLAudioElement | null,
  slotRef: React.MutableRefObject<GainSlot | null>,
  ctxRef: React.MutableRefObject<AudioContext | null>,
): GainSlot | null {
  if (!audio) return null;
  if (slotRef.current) return slotRef.current;
  const ctx = ensureCtx(ctxRef);
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const source = ctx.createMediaElementSource(audio);
  source.connect(gain);
  gain.connect(ctx.destination);
  slotRef.current = { gain, source };
  return slotRef.current;
}

/** Linear ramp on a GainNode, cancelling previous scheduled values first. */
function rampGain(
  ctx: AudioContext,
  gain: GainNode,
  target: number,
  fadeMs: number,
): void {
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(target, now + fadeMs / 1000);
}

/** Fetch a fresh signed URL, falling back to the stored URL on error. */
async function refreshUrl(track: AudioTrackDTO): Promise<string> {
  try {
    const fresh = await getAudioPlaybackUrl(track.id);
    return fresh.url;
  } catch {
    return track.url;
  }
}

/** Resume an AudioContext that may have been auto-suspended. */
async function resumeCtx(ctx: AudioContext): Promise<void> {
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch { /* autoplay blocked */ }
  }
}

// ── A/B crossfade hook ────────────────────────────────────────────────────────

interface ABRefs {
  a: React.RefObject<HTMLAudioElement | null>;
  b: React.RefObject<HTMLAudioElement | null>;
}

interface CrossfadeContext {
  ctxRef: React.MutableRefObject<AudioContext | null>;
  slotARef: React.MutableRefObject<GainSlot | null>;
  slotBRef: React.MutableRefObject<GainSlot | null>;
  activeIdxRef: React.MutableRefObject<0 | 1>;
  activeTrackRef: React.MutableRefObject<string | null>;
  fadeTimerRef: React.MutableRefObject<number | null>;
  refs: ABRefs;
  masterVolume: number;
  channelVolume: number;
}

function audioEl(refs: ABRefs, idx: 0 | 1): HTMLAudioElement | null {
  return idx === 0 ? refs.a.current : refs.b.current;
}

function slotRefFor(
  idx: 0 | 1,
  slotARef: React.MutableRefObject<GainSlot | null>,
  slotBRef: React.MutableRefObject<GainSlot | null>,
): React.MutableRefObject<GainSlot | null> {
  return idx === 0 ? slotARef : slotBRef;
}

/** Sentinel: returned from loadAndStart when autoplay is blocked by browser policy. */
export const AUTOPLAY_BLOCKED = 'AUTOPLAY_BLOCKED' as const;

/**
 * Load the next track into nextAudio and begin playback.
 * Returns `true` on success, `false` if the operation was cancelled (non-policy
 * error), or `AUTOPLAY_BLOCKED` when the browser refuses due to autoplay policy.
 */
async function loadAndStart(
  nextAudio: HTMLAudioElement,
  nextSlot: GainSlot,
  ctx: AudioContext,
  track: AudioTrackDTO,
  startedAt: number,
  url: string,
): Promise<boolean | typeof AUTOPLAY_BLOCKED> {
  nextAudio.src = url;
  nextAudio.loop = track.loop;
  const elapsed = Math.max(0, (Date.now() - startedAt) / 1000);
  nextAudio.currentTime = elapsed;

  nextSlot.gain.gain.cancelScheduledValues(ctx.currentTime);
  nextSlot.gain.gain.setValueAtTime(0, ctx.currentTime);

  try {
    await nextAudio.play();
    return true;
  } catch (err) {
    // Chrome throws NotAllowedError when autoplay is blocked by policy.
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      return AUTOPLAY_BLOCKED;
    }
    return false;
  }
}

/**
 * Fade the next slot in and the previous slot out, scheduling a deferred
 * pause on the old slot after the fade completes.
 */
function crossfadeSlots(
  ctx: AudioContext,
  nextSlot: GainSlot,
  prevAudio: HTMLAudioElement | null,
  prevGain: GainNode | null,
  fadeMs: number,
  targetGain: number,
  fadeTimerRef: React.MutableRefObject<number | null>,
): void {
  rampGain(ctx, nextSlot.gain, targetGain, fadeMs);
  if (prevGain) rampGain(ctx, prevGain, 0, fadeMs);

  if (fadeTimerRef.current !== null) window.clearTimeout(fadeTimerRef.current);
  fadeTimerRef.current = window.setTimeout(() => {
    if (prevAudio) {
      prevAudio.pause();
      prevAudio.currentTime = 0;
    }
    fadeTimerRef.current = null;
  }, fadeMs);
}

/**
 * Manages crossfade A/B for a single persistent audio layer.
 *
 * Slot A starts as active (activeIdxRef = 0).  When a new trackId arrives
 * the inactive slot loads+plays while the active slot fades out; after
 * fadeMs the old slot pauses and indices swap.
 *
 * Volume changes while a fade is in progress are applied without cancelling
 * the in-flight ramp — the current ramp end-point is updated via a new
 * setValueAtTime on the active slot only.
 */
function usePersistentLayerAB(
  payload: AudioPlayPayload | null,
  refs: ABRefs,
  ctxRef: React.MutableRefObject<AudioContext | null>,
  tracks: AudioTrackDTO[],
  channelVolume: number,
  masterVolume: number,
  onGestureNeeded: () => void,
): void {
  const activeIdxRef = useRef<0 | 1>(0);
  const activeTrackRef = useRef<string | null>(null);
  const slotARef = useRef<GainSlot | null>(null);
  const slotBRef = useRef<GainSlot | null>(null);
  // `window.setTimeout` returns number in browsers; explicit number avoids
  // collision with Node's Timeout type that @types/node injects.
  const fadeTimerRef = useRef<number | null>(null);

  const cfCtx: CrossfadeContext = {
    ctxRef, slotARef, slotBRef, activeIdxRef, activeTrackRef, fadeTimerRef,
    refs, masterVolume, channelVolume,
  };

  // Volume-sync: keep the active slot's gain in line with slider movements.
  // Does NOT cancel an in-flight ramp — slider adjustments are instantaneous.
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const isPlaying = payload?.kind === 'persistent' && payload.action !== 'stop';
    if (!isPlaying) return;
    const activeSlotRef = slotRefFor(activeIdxRef.current, slotARef, slotBRef);
    const gain = activeSlotRef.current?.gain ?? null;
    if (!gain) return;
    gain.gain.setValueAtTime(masterVolume * channelVolume, ctx.currentTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterVolume, channelVolume]);

  // Main payload effect.
  useEffect(() => {
    if (!payload || payload.kind !== 'persistent') return;

    // ── STOP ──────────────────────────────────────────────────────────────────
    if (payload.action === 'stop') {
      return handleStop(payload.fadeMs, cfCtx);
    }

    // ── PLAY / SWITCH ─────────────────────────────────────────────────────────
    const { trackId, fadeMs, startedAt } = payload;
    if (activeTrackRef.current === trackId) return; // same track — no-op

    const track = tracks.find((t) => t.id === trackId);
    if (!track) return;

    let cancelled = false;

    void (async (): Promise<void> => {
      const url = await refreshUrl(track);
      if (cancelled) return;

      const ctx = ensureCtx(ctxRef);
      await resumeCtx(ctx);
      if (cancelled) return;

      const nextIdx: 0 | 1 = activeIdxRef.current === 0 ? 1 : 0;
      const nextAudio = audioEl(refs, nextIdx);
      if (!nextAudio) return;

      const nextSlotRef = slotRefFor(nextIdx, slotARef, slotBRef);
      const nextSlot = ensureSlot(nextAudio, nextSlotRef, ctxRef);
      if (!nextSlot) return;

      const started = await loadAndStart(nextAudio, nextSlot, ctx, track, startedAt, url);
      if (started === AUTOPLAY_BLOCKED) {
        onGestureNeeded();
        return;
      }
      if (!started || cancelled) return;

      const prevIdx = activeIdxRef.current;
      const prevSlotRef = slotRefFor(prevIdx, slotARef, slotBRef);
      const prevGain = prevSlotRef.current?.gain ?? null;
      const prevAudio = audioEl(refs, prevIdx);

      crossfadeSlots(
        ctx, nextSlot, prevAudio, prevGain,
        fadeMs, masterVolume * channelVolume, fadeTimerRef,
      );

      activeIdxRef.current = nextIdx;
      activeTrackRef.current = trackId;
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, tracks, masterVolume, channelVolume]);
}

/** Handle the stop action: fade out and pause after fadeMs. */
function handleStop(
  fadeMs: number,
  cfCtx: CrossfadeContext,
): (() => void) | undefined {
  const ctx = cfCtx.ctxRef.current;
  const activeSlotRef = slotRefFor(cfCtx.activeIdxRef.current, cfCtx.slotARef, cfCtx.slotBRef);
  const gain = activeSlotRef.current?.gain ?? null;
  const active = audioEl(cfCtx.refs, cfCtx.activeIdxRef.current);
  if (!ctx || !gain || !active) return undefined;

  rampGain(ctx, gain, 0, fadeMs);
  if (cfCtx.fadeTimerRef.current !== null) window.clearTimeout(cfCtx.fadeTimerRef.current);
  cfCtx.fadeTimerRef.current = window.setTimeout(() => {
    active.pause();
    active.currentTime = 0;
    cfCtx.activeTrackRef.current = null;
    cfCtx.fadeTimerRef.current = null;
  }, fadeMs);

  return () => {
    if (cfCtx.fadeTimerRef.current !== null) window.clearTimeout(cfCtx.fadeTimerRef.current);
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Headless audio host. Renders:
 *   - TWO <audio> elements for the 'music' layer (A/B crossfade)
 *   - TWO <audio> elements for the 'ambient' layer (A/B crossfade)
 *   - Five <audio> elements forming an SFX one-shot pool
 *   - A gesture-unlock overlay (portal) when the browser has suspended AudioContext
 *
 * No visible UI is rendered (except the conditional gesture overlay) — this
 * component lives mounted next to AudioPanel inside the sidebar so playback
 * survives tab switches.
 */
export default function AudioPlayer(): JSX.Element {
  const { t } = useTranslation('campaign');
  const dispatch = useAppDispatch();
  const currentMusic = useAppSelector((s) => s.audio.current.music);
  const currentAmbient = useAppSelector((s) => s.audio.current.ambient);
  const pendingSfx = useAppSelector((s) => s.audio.pendingSfx);
  const volume = useAppSelector((s) => s.audio.volume);
  const tracks = useAppSelector((s) => s.audio.tracks);

  // Music A/B refs
  const musicARef = useRef<HTMLAudioElement | null>(null);
  const musicBRef = useRef<HTMLAudioElement | null>(null);
  // Ambient A/B refs
  const ambientARef = useRef<HTMLAudioElement | null>(null);
  const ambientBRef = useRef<HTMLAudioElement | null>(null);
  // SFX pool
  const sfxRefs = useRef<Array<HTMLAudioElement | null>>(Array(SFX_POOL_SIZE).fill(null));

  // Shared AudioContext for all persistent layers.
  const ctxRef = useRef<AudioContext | null>(null);

  // True when the browser blocked autoplay and the user must gesture to unlock.
  const [needsGesture, setNeedsGesture] = useState(false);

  function handleGestureNeeded(): void {
    setNeedsGesture(true);
  }

  async function handleGestureClick(): Promise<void> {
    const ctx = ctxRef.current;
    if (ctx) {
      try { await ctx.resume(); } catch { /* ignore */ }
    }
    setNeedsGesture(false);
  }

  usePersistentLayerAB(
    currentMusic,
    { a: musicARef, b: musicBRef },
    ctxRef,
    tracks,
    volume.music,
    volume.master,
    handleGestureNeeded,
  );

  usePersistentLayerAB(
    currentAmbient,
    { a: ambientARef, b: ambientBRef },
    ctxRef,
    tracks,
    volume.ambient,
    volume.master,
    handleGestureNeeded,
  );

  // ── SFX one-shot pool ─────────────────────────────────────────────────────

  useEffect(() => {
    if (pendingSfx.length === 0) return;

    for (const event of pendingSfx) {
      const track = tracks.find((t) => t.id === event.trackId);
      if (!track) {
        dispatch(consumeSfx(event.id));
        continue;
      }

      const freeIdx = sfxRefs.current.findIndex((el) => !el || el.paused || el.ended);
      if (freeIdx === -1) {
        dispatch(consumeSfx(event.id));
        continue;
      }

      const el = sfxRefs.current[freeIdx];
      if (!el) {
        dispatch(consumeSfx(event.id));
        continue;
      }

      el.src = track.url;
      el.volume = Math.max(0, Math.min(1, volume.master * volume.sfx));
      el.onended = () => { dispatch(consumeSfx(event.id)); };
      el.play().catch(() => { dispatch(consumeSfx(event.id)); });
    }
  }, [pendingSfx, tracks, volume.master, volume.sfx, dispatch]);

  // ── Render (no visible UI, + conditional gesture overlay) ───────────────

  const gestureOverlay = needsGesture
    ? createPortal(
        <div
          data-testid="audio-gesture-overlay"
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            right: '1.5rem',
            zIndex: 9999,
            background: 'var(--color-surface-raised, #1e1e2e)',
            border: '1px solid var(--color-border, #444)',
            borderRadius: '0.5rem',
            padding: '0.75rem 1.25rem',
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            cursor: 'pointer',
            color: 'var(--color-text, #e0e0e0)',
            fontSize: '0.875rem',
          }}
          role="button"
          tabIndex={0}
          onClick={() => { void handleGestureClick(); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              void handleGestureClick();
            }
          }}
        >
          {t('audio.gestureOverlay.label', { defaultValue: 'Click to enable audio playback' })}
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      {gestureOverlay}
      <div
        aria-hidden="true"
        style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
      >
        <audio ref={musicARef} data-testid="audio-player-music-a" preload="auto" crossOrigin="anonymous" />
        <audio ref={musicBRef} data-testid="audio-player-music-b" preload="auto" crossOrigin="anonymous" />
        <audio ref={ambientARef} data-testid="audio-player-ambient-a" preload="auto" crossOrigin="anonymous" />
        <audio ref={ambientBRef} data-testid="audio-player-ambient-b" preload="auto" crossOrigin="anonymous" />
        {Array.from({ length: SFX_POOL_SIZE }, (_, i) => (
          <audio
            key={i}
            ref={(el) => { sfxRefs.current[i] = el; }}
            data-testid={`audio-player-sfx-${i}`}
            preload="none"
            crossOrigin="anonymous"
          />
        ))}
      </div>
    </>
  );
}
