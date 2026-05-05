/**
 * Voice Activity Detection via Web Audio API.
 *
 * Polls each MediaStream's audio track via an AnalyserNode every animation
 * frame and reports a debounced speaking/silent state through the callback.
 * Uses average frequency-bin amplitude (0..255) with a configurable threshold
 * and a hangover window to avoid flicker between words.
 */

export interface SpeakingDetectorCallbacks {
  onSpeakingChange: (peerId: string, speaking: boolean) => void;
}

interface DetectorEntry {
  src: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  data: Uint8Array;
  raf: number;
  speaking: boolean;
  lastSpeakAt: number;
}

const THRESHOLD = 25;       // 0..255 — raw average frequency-bin amplitude
const HANGOVER_MS = 600;    // anti-flicker: keep "speaking" for this long after last threshold cross

export class SpeakingDetector {
  private ctx: AudioContext | null = null;
  private readonly entries = new Map<string, DetectorEntry>();
  private readonly cb: SpeakingDetectorCallbacks;

  constructor(cb: SpeakingDetectorCallbacks) {
    this.cb = cb;
  }

  attach(peerId: string, stream: MediaStream): void {
    if (this.entries.has(peerId)) return;
    if (stream.getAudioTracks().length === 0) return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
    }
    const ctx = this.ctx;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.5;
    src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const entry: DetectorEntry = {
      src,
      analyser,
      data,
      raf: 0,
      speaking: false,
      lastSpeakAt: 0,
    };
    const tick = (): void => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] ?? 0;
      const avg = sum / data.length;
      const now = performance.now();
      if (avg > THRESHOLD) entry.lastSpeakAt = now;
      const isSpeaking = now - entry.lastSpeakAt < HANGOVER_MS;
      if (isSpeaking !== entry.speaking) {
        entry.speaking = isSpeaking;
        this.cb.onSpeakingChange(peerId, isSpeaking);
      }
      entry.raf = requestAnimationFrame(tick);
    };
    entry.raf = requestAnimationFrame(tick);
    this.entries.set(peerId, entry);
  }

  detach(peerId: string): void {
    const entry = this.entries.get(peerId);
    if (!entry) return;
    cancelAnimationFrame(entry.raf);
    try { entry.src.disconnect(); } catch { /* ignore */ }
    if (entry.speaking) this.cb.onSpeakingChange(peerId, false);
    this.entries.delete(peerId);
  }

  destroy(): void {
    for (const peerId of [...this.entries.keys()]) this.detach(peerId);
    if (this.ctx) {
      void this.ctx.close().catch(() => { /* ignore */ });
      this.ctx = null;
    }
  }
}
