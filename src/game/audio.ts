type Cue = 'swing' | 'hit' | 'pickup' | 'ward' | 'special' | 'victory' | 'hurt';

class SoundFx {
  enabled = true;
  private context: AudioContext | null = null;
  private lastPlayed = new Map<Cue, number>();

  play(cue: Cue): void {
    if (!this.enabled) return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(cue) ?? -1000) < (cue === 'hit' ? 90 : 55)) return;
    this.lastPlayed.set(cue, now);
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume();
      const context = this.context;
      const tone = context.createOscillator();
      const gain = context.createGain();
      const voices: Record<Cue, [number, number, number, OscillatorType]> = {
        swing: [250, 170, 0.075, 'triangle'], hit: [135, 83, 0.09, 'sawtooth'],
        pickup: [570, 850, 0.17, 'sine'], ward: [410, 170, 0.27, 'triangle'],
        special: [210, 690, 0.36, 'sawtooth'], victory: [440, 880, 0.65, 'sine'],
        hurt: [130, 74, 0.19, 'triangle'],
      };
      const [start, end, duration, shape] = voices[cue];
      tone.type = shape;
      tone.frequency.setValueAtTime(start, context.currentTime);
      tone.frequency.exponentialRampToValueAtTime(end, context.currentTime + duration);
      gain.gain.setValueAtTime(cue === 'special' || cue === 'victory' ? 0.07 : 0.035, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      tone.connect(gain).connect(context.destination);
      tone.start(); tone.stop(context.currentTime + duration);
    } catch { /* Sound is optional when the browser denies audio. */ }
  }
}

export const soundFx = new SoundFx();
