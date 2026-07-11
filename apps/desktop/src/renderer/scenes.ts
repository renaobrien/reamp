/**
 * Modern visual scenes: original, math-driven, rendered full-bleed on the
 * stage behind Webamp. All of them read the same VisFrameEvent the
 * classic vis gets: 75 log-spaced band levels, 75 waveform points, and
 * the raw 1024-sample PCM window.
 *
 * The spectral features are simple and honest: bass/mid/treble are mean
 * energies over thirds of the log-spaced bands, and beats are detected
 * as positive bass-energy flux above a rolling average.
 */
import type { VisFrameEvent } from '../shared/ipc.js';

export interface SpectralFeatures {
  bass: number;
  mid: number;
  treble: number;
  /** 1.0 on the frame a beat lands, decaying toward 0. */
  beat: number;
}

/** Rolling beat detector: positive bass flux vs its own recent average. */
export class FeatureExtractor {
  private history: number[] = [];
  private lastBass = 0;
  private beatEnv = 0;

  extract(frame: VisFrameEvent): SpectralFeatures {
    const third = Math.floor(frame.levels.length / 3);
    const mean = (from: number, to: number): number => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += frame.levels[i]!;
      return sum / Math.max(1, to - from);
    };
    const bass = mean(0, third);
    const mid = mean(third, third * 2);
    const treble = mean(third * 2, frame.levels.length);

    const flux = Math.max(0, bass - this.lastBass);
    this.lastBass = bass;
    this.history.push(flux);
    if (this.history.length > 43) this.history.shift(); // ~1.4s at 30Hz
    const avg = this.history.reduce((a, b) => a + b, 0) / this.history.length;
    if (flux > avg * 2.2 && flux > 0.02) this.beatEnv = 1;
    else this.beatEnv *= 0.88;

    return { bass, mid, treble, beat: this.beatEnv };
  }
}

export interface Scene {
  readonly name: string;
  render(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    frame: VisFrameEvent,
    f: SpectralFeatures,
    t: number,
    /** Milliseconds since the previous frame; physics scale by dt/16.7 so
     * motion is identical at 30, 60, or 120 fps. */
    dt: number,
  ): void;
}

/**
 * TUNNEL: the waveform wrapped into rings that fly outward from the
 * center. Ring speed rides the bass, hue rides the treble, and beats
 * kick the whole field. Additive blending + per-frame fade = neon trails.
 */
class TunnelScene implements Scene {
  readonly name = 'Tunnel';
  private rings: Array<{ r: number; hue: number; amp: number; rot: number }> = [];

  render(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    frame: VisFrameEvent,
    f: SpectralFeatures,
    t: number,
    dt: number,
  ): void {
    const dtn = Math.min(6, dt / 16.7);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(4, 4, 10, ${Math.min(0.5, 0.22 * dtn)})`;
    ctx.fillRect(0, 0, w, h);

    if (this.rings.length === 0 || this.rings.at(-1)!.r > Math.min(w, h) * 0.05) {
      this.rings.push({
        r: Math.min(w, h) * 0.01,
        hue: 165 - f.treble * 140 + Math.sin(t * 0.0002) * 30,
        amp: 0.35 + f.mid * 2,
        rot: t * 0.0004,
      });
    }

    ctx.globalCompositeOperation = 'lighter';
    const cx = w / 2;
    const cy = h / 2;
    const speed = 1 + f.bass * 5 + f.beat * 6;
    const points = frame.wave.length;

    for (const ring of this.rings) {
      ring.r *= Math.pow(1 + 0.02 * speed, dtn);
      const alpha = Math.max(0, 1 - ring.r / (Math.max(w, h) * 0.75));
      if (alpha <= 0) continue;
      ctx.strokeStyle = `hsla(${ring.hue}, 95%, ${55 + f.beat * 25}%, ${alpha * 0.9})`;
      ctx.lineWidth = Math.max(1.5, ring.r * 0.025);
      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const wv = frame.wave[i % points]!;
        const a = (i / points) * 2 * Math.PI + ring.rot;
        const r = ring.r * (1 + wv * ring.amp * 0.35);
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r * 0.82; // slight squash: perspective
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    this.rings = this.rings.filter((ring) => ring.r < Math.max(w, h));
  }
}

/**
 * PLASMA: a classic four-term sine interference field computed at low
 * resolution and scaled up. Band energies bend the field's spatial
 * frequencies; the palette breathes with the bass.
 */
class PlasmaScene implements Scene {
  readonly name = 'Plasma';
  private readonly cols = 168;
  private readonly rows = 96;
  private buffer: OffscreenCanvas | HTMLCanvasElement | null = null;
  private image: ImageData | null = null;

  render(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    _frame: VisFrameEvent,
    f: SpectralFeatures,
    t: number,
    _dt: number,
  ): void {
    if (this.buffer === null) {
      this.buffer = document.createElement('canvas');
      this.buffer.width = this.cols;
      this.buffer.height = this.rows;
    }
    const bctx = this.buffer.getContext('2d') as CanvasRenderingContext2D;
    this.image ??= bctx.createImageData(this.cols, this.rows);
    const px = this.image.data;

    const ts = t * 0.001;
    const a = 0.09 + f.bass * 0.12;
    const b = 0.11 + f.mid * 0.1;
    const c = 0.07 + f.treble * 0.16;
    const baseHue = (ts * 12) % 360;

    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const dx = x - this.cols / 2;
        const dy = y - this.rows / 2;
        const v =
          Math.sin(x * a + ts) +
          Math.sin(y * b - ts * 1.31) +
          Math.sin((x + y) * c * 0.6 + ts * 0.7) +
          Math.sin(Math.sqrt(dx * dx + dy * dy) * (0.15 + f.beat * 0.1) - ts * 2);
        // v in [-4, 4] -> hue offset and lightness
        const hue = (baseHue + v * 28 + 360) % 360;
        const light = 0.28 + (v + 4) * 0.055 + f.beat * 0.12;
        const [r, g, bl] = hslToRgb(hue / 360, 0.85, Math.min(0.72, light));
        const i = (y * this.cols + x) * 4;
        px[i] = r;
        px[i + 1] = g;
        px[i + 2] = bl;
        px[i + 3] = 255;
      }
    }
    bctx.putImageData(this.image, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.buffer, 0, 0, w, h);
  }
}

/**
 * SWARM: a few hundred particles in a swirl field. The tangential pull
 * rides the mids, beats fire a radial shockwave, and each particle's
 * color encodes its speed. Trails come from the per-frame fade.
 */
class SwarmScene implements Scene {
  readonly name = 'Swarm';
  private particles: Array<{ x: number; y: number; vx: number; vy: number }> = [];

  render(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    _frame: VisFrameEvent,
    f: SpectralFeatures,
    _t: number,
    dt: number,
  ): void {
    const dtn = Math.min(6, dt / 16.7);
    if (this.particles.length === 0) {
      for (let i = 0; i < 420; i++) {
        this.particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: 0,
          vy: 0,
        });
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(4, 4, 10, ${Math.min(0.5, 0.16 * dtn)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    const cx = w / 2;
    const cy = h / 2;
    const swirl = 0.9 + f.mid * 6;
    const pull = 0.012 + f.treble * 0.02;
    const kick = f.beat * 3.2;
    const scale = Math.min(w, h) / 500;

    for (const p of this.particles) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d = Math.max(20, Math.hypot(dx, dy));
      // swirl (tangential) + spring toward a bass-breathing orbit radius
      const target = Math.min(w, h) * (0.18 + f.bass * 0.35);
      const radial = (target - d) * pull + kick;
      p.vx += ((-dy / d) * swirl * 0.05 * scale + (dx / d) * radial * 0.08) * dtn;
      p.vy += ((dx / d) * swirl * 0.05 * scale + (dy / d) * radial * 0.08) * dtn;
      const damp = Math.pow(0.96, dtn);
      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * dtn;
      p.y += p.vy * dtn;
      if (p.x < 0) p.x += w;
      if (p.x > w) p.x -= w;
      if (p.y < 0) p.y += h;
      if (p.y > h) p.y -= h;

      const speed = Math.hypot(p.vx, p.vy);
      const hue = 170 - Math.min(1, speed / (6 * scale)) * 150;
      ctx.fillStyle = `hsla(${hue}, 95%, ${50 + f.beat * 25}%, 0.8)`;
      const size = Math.max(1.5, 1.5 + speed * 0.4) * scale;
      ctx.fillRect(p.x, p.y, size, size);
    }
  }
}

export function createScenes(): Scene[] {
  return [new TunnelScene(), new PlasmaScene(), new SwarmScene()];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number): number => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
