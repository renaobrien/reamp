/**
 * The classic vis, drawn the way Winamp drew it: a coarse pixel grid of
 * 2px blocks with 1px gutters, the 16-step viscolor gradient from dark
 * green at the base to red at the tip, falling peak caps, and a
 * click-to-toggle oscilloscope mode. Rendered at logical resolution and
 * scaled up with pixelated image-rendering for the chunky look.
 */
import { PeakTracker } from '@reamp/vis-engine';
import { DEFAULT_VISCOLORS, rgbToCss, type Rgb } from '@reamp/skins';
import type { VisFrameEvent } from '../shared/ipc.js';

const BANDS = 75;
const BAR_W = 3;
const GAP = 1;
const SEGMENTS = 16;
const SEG_H = 2;
const SEG_GAP = 1;

export const VIS_LOGICAL_WIDTH = BANDS * (BAR_W + GAP) - GAP; // 299
export const VIS_LOGICAL_HEIGHT = SEGMENTS * (SEG_H + SEG_GAP) + 1; // 49

export type VisMode = 'bars' | 'scope';

export class ClassicVis {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly peaks = new PeakTracker(BANDS, { holdFrames: 10, gravity: 0.004 });
  private colors: readonly Rgb[] = DEFAULT_VISCOLORS;
  private mode: VisMode = 'bars';

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = VIS_LOGICAL_WIDTH;
    canvas.height = VIS_LOGICAL_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('canvas 2d context unavailable');
    this.ctx = ctx;
  }

  /** Swap in a skin's palette (viscolor.txt order). */
  setColors(colors: readonly Rgb[]): void {
    this.colors = colors;
  }

  setMode(mode: VisMode): void {
    this.mode = mode;
  }

  render(frame: VisFrameEvent): void {
    this.drawBackground();
    if (this.mode === 'bars') this.drawBars(frame.levels);
    else this.drawScope(frame.wave);
  }

  private drawBackground(): void {
    const { ctx } = this;
    ctx.fillStyle = rgbToCss(this.colors[0]!);
    ctx.fillRect(0, 0, VIS_LOGICAL_WIDTH, VIS_LOGICAL_HEIGHT);
    // the sparse background dot grid of the classic vis window
    ctx.fillStyle = rgbToCss(this.colors[1]!);
    for (let y = 1; y < VIS_LOGICAL_HEIGHT; y += SEG_H + SEG_GAP) {
      for (let x = 0; x < VIS_LOGICAL_WIDTH; x += (BAR_W + GAP) * 2) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  private drawBars(levels: number[]): void {
    const { ctx } = this;
    const caps = this.peaks.update(levels);
    for (let i = 0; i < Math.min(BANDS, levels.length); i++) {
      const x = i * (BAR_W + GAP);
      const lit = Math.round(levels[i]! * SEGMENTS);
      for (let s = 0; s < lit; s++) {
        // viscolor: index 2 is the TOP of the bar, 17 the bottom
        ctx.fillStyle = rgbToCss(this.colors[17 - s]!);
        ctx.fillRect(x, VIS_LOGICAL_HEIGHT - (s + 1) * (SEG_H + SEG_GAP), BAR_W, SEG_H);
      }
      const cap = Math.round(caps[i]! * SEGMENTS);
      if (cap > 0) {
        ctx.fillStyle = rgbToCss(this.colors[23]!);
        ctx.fillRect(x, VIS_LOGICAL_HEIGHT - cap * (SEG_H + SEG_GAP) - 1, BAR_W, 1);
      }
    }
  }

  private drawScope(wave: number[]): void {
    const { ctx } = this;
    const mid = Math.floor(VIS_LOGICAL_HEIGHT / 2);
    for (let i = 0; i < Math.min(BANDS, wave.length); i++) {
      const x = i * (BAR_W + GAP);
      const y = mid + Math.round((wave[i]! * VIS_LOGICAL_HEIGHT) / 2.2);
      // center color for the dot, then a dimmer tail toward the midline
      const clampedY = Math.max(0, Math.min(VIS_LOGICAL_HEIGHT - 1, y));
      const distance = Math.min(4, Math.abs(clampedY - mid));
      ctx.fillStyle = rgbToCss(this.colors[18 + distance]!);
      ctx.fillRect(x, clampedY, BAR_W, 1);
    }
  }
}
