let ctx: AudioContext | null = null;

/** Soft 660 Hz beep (~200 ms). Lazy AudioContext, no asset. No-op if muted
 *  or AudioContext unavailable (older browsers / SSR). */
export function playNotificationBeep(muted: boolean): void {
  if (muted) return;
  try {
    if (!ctx) {
      const Ctor = (typeof window !== 'undefined' &&
        ((window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
         (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)) ?? null;
      if (!Ctor) return;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 660;
    const t0 = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(t0 + 0.2);
  } catch {
    /* AudioContext unavailable or blocked — ignore */
  }
}
