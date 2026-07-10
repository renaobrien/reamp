/**
 * Preset navigation for the Milkdrop window: next/previous in a stable
 * order plus random jumps, with an injectable RNG so it's testable.
 */
export class PresetCycler {
  private readonly names: string[];
  private readonly random: () => number;
  private index = 0;

  constructor(names: string[], random: () => number = Math.random) {
    if (names.length === 0) throw new Error('no presets to cycle');
    this.names = names;
    this.random = random;
  }

  get count(): number {
    return this.names.length;
  }

  get current(): string {
    return this.names[this.index]!;
  }

  next(): string {
    this.index = (this.index + 1) % this.names.length;
    return this.current;
  }

  previous(): string {
    this.index = (this.index - 1 + this.names.length) % this.names.length;
    return this.current;
  }

  /** Jump to a random preset, never the current one (when there is a choice). */
  randomJump(): string {
    if (this.names.length === 1) return this.current;
    const offset = 1 + Math.floor(this.random() * (this.names.length - 1));
    this.index = (this.index + offset) % this.names.length;
    return this.current;
  }
}
