// The recording timeline excludes pauses; transcript times use this same clock.
export class RecorderClock {
  constructor(now = () => performance.now()) { this.now = now; this.reset(); }
  reset() { this.started = this.now(); this.pausedAt = null; this.pausedMs = 0; }
  pause() { if (this.pausedAt === null) this.pausedAt = this.now(); }
  resume() { if (this.pausedAt !== null) { this.pausedMs += this.now() - this.pausedAt; this.pausedAt = null; } }
  seconds() { return Math.max(0, ((this.pausedAt ?? this.now()) - this.started - this.pausedMs) / 1000); }
}
