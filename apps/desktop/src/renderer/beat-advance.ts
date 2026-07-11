/**
 * Beat-synced preset advancing (PRD P1): switch Milkdrop presets on a
 * detected beat instead of a wall-clock timer, with a minimum hold so a
 * driving four-on-the-floor doesn't strobe through the preset library.
 * Pure logic, clock injected by the caller.
 */
export class BeatAdvance {
  private readonly holdMs: number;
  private lastAdvance = Number.NEGATIVE_INFINITY;

  constructor(holdMs = 20_000) {
    this.holdMs = holdMs;
  }

  /** True exactly when a fresh beat lands after the hold has elapsed. */
  shouldAdvance(nowMs: number, beat: number): boolean {
    if (beat < 0.99) return false; // only the triggering frame, not the decay
    if (nowMs - this.lastAdvance < this.holdMs) return false;
    this.lastAdvance = nowMs;
    return true;
  }

  /** Manual navigation resets the hold so it doesn't double-fire. */
  notifyManualChange(nowMs: number): void {
    this.lastAdvance = nowMs;
  }
}
