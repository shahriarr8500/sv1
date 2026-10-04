/**
 * Alarm sound for timer completion — three short beeps through the Web Audio
 * API, so no audio asset is needed. Silently does nothing if audio is
 * unavailable; callers always pair this with a toast.
 */

let context: AudioContext | null = null;

export function playAlarm(): void {
  try {
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtor) return;

    context ??= new AudioCtor();
    const ctx = context;
    if (ctx.state === "suspended") void ctx.resume();

    const start = ctx.currentTime + 0.05;
    for (let pulse = 0; pulse < 3; pulse++) {
      const at = start + pulse * 0.45;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.35);
    }
  } catch {
    // Audio is unavailable — the toast notification still fires.
  }
}
