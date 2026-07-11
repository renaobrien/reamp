/**
 * Modern visual scenes: original, math-driven, rendered full-bleed on the
 * stage behind Webamp. All of them read the same VisFrameEvent the
 * classic vis gets: 75 log-spaced band levels, 75 waveform points, and
 * the raw 1024-sample PCM window.
 *
 * The spectral features are simple and honest: bass/mid/treble are mean
 * energies over thirds of the log-spaced bands, and beats are detected
 * as positive bass-energy flux above a rolling average.
 *
 * Depth is real in all three: Tunnel projects rings from z-space with a
 * wandering vanishing point, Swarm runs parallax layers where distance
 * scales speed, size, and brightness, and Plasma composites a slow deep
 * field under the audio-driven foreground with an edge vignette.
 */
import type { VisFrameEvent } from '../shared/ipc.js';

export interface SpectralFeatures {
  bass: number;
  mid: number;
  treble: number;
  /** 1.0 on the frame a beat lands, decaying toward 0. */
  beat: number;
  /** Spectral centroid 0..1: where the energy lives, dark to bright. */
  centroid: number;
  /** Mean band level 0..1: how loud the moment is. */
  loudness: number;
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

    let weighted = 0;
    let total = 0;
    for (let i = 0; i < frame.levels.length; i++) {
      weighted += frame.levels[i]! * i;
      total += frame.levels[i]!;
    }
    const centroid = total > 0 ? weighted / total / (frame.levels.length - 1) : 0;
    // mean band level is tiny for real music (most bands near zero), so
    // scale into a usable 0..1 perceptual-ish range
    const loudness = Math.min(1, (total / frame.levels.length) * 4);

    return { bass, mid, treble, beat: this.beatEnv, centroid, loudness };
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
 * TUNNEL: waveform rings and a starfield projected from real z-space
 * toward a vanishing point that drifts with the mids. Bass drives flight
 * speed, beats punch it, distant geometry dims and cools toward violet,
 * near geometry burns bright. Additive blending gives the neon glow.
 */
class TunnelScene implements Scene {
  readonly name = 'Tunnel';
  private static readonly Z_FAR = 8;
  private rings: Array<{ z: number; hue: number; amp: number; rot: number }> = [];
  private stars: Array<{ a: number; rr: number; z: number }> = [];

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
    const ZF = TunnelScene.Z_FAR;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(3, 3, 12, ${Math.min(0.6, 0.28 * dtn)})`;
    ctx.fillRect(0, 0, w, h);

    // the vanishing point wanders with the music
    const cx = w / 2 + Math.sin(t * 0.00037) * w * 0.09 * (0.4 + f.mid * 2);
    const cy = h / 2 + Math.cos(t * 0.00029) * h * 0.09 * (0.4 + f.mid * 2);
    const speed = (0.9 + f.bass * 3.2 + f.beat * 4.5) * 0.022 * dtn;
    const minDim = Math.min(w, h);
    ctx.globalCompositeOperation = 'lighter';

    // starfield behind the rings, same projection
    if (this.stars.length === 0) {
      for (let i = 0; i < 110; i++) {
        this.stars.push({ a: Math.random() * Math.PI * 2, rr: 0.25 + Math.random(), z: 0.2 + Math.random() * ZF });
      }
    }
    for (const s of this.stars) {
      s.z -= speed * 1.4;
      if (s.z <= 0.15) {
        s.z = ZF;
        s.a = Math.random() * Math.PI * 2;
      }
      const pr = (minDim * 0.9 * s.rr) / s.z;
      const size = Math.min(4, 1.6 / s.z + f.beat);
      const light = Math.min(80, 25 + 90 / s.z);
      ctx.fillStyle = `hsla(${220 - f.treble * 60}, 60%, ${light}%, ${Math.min(1, 1.4 / s.z)})`;
      ctx.fillRect(cx + Math.cos(s.a) * pr, cy + Math.sin(s.a) * pr, size, size);
    }

    // spawn rings with even z spacing; hue frozen at birth from the
    // spectral centroid, so the tunnel is a scrolling history of the
    // music's brightness (warm bass moments, cool bright ones)
    if (this.rings.length === 0 || this.rings.at(-1)!.z < ZF - 0.55) {
      this.rings.push({
        z: ZF,
        hue: (25 + f.centroid * 275 + t * 0.004) % 360,
        amp: 0.3 + f.mid * 2 + f.beat,
        rot: t * 0.0004,
      });
    }

    const points = frame.wave.length;
    for (const ring of this.rings) {
      ring.z -= speed;
      if (ring.z <= 0.12) continue;
      const pr = (minDim * 0.5) / ring.z;
      const near = Math.min(1, 1.6 / ring.z); // 0 far .. 1 near
      // depth cue: distant rings cool toward violet and dim; loudness
      // lifts the whole tunnel's brightness
      const hue = (ring.hue - (1 - near) * 70 + 360) % 360;
      const light = 22 + near * 30 + f.beat * 22 + f.loudness * 30;
      ctx.strokeStyle = `hsla(${hue}, 95%, ${Math.min(78, light)}%, ${0.25 + near * 0.65})`;
      ctx.lineWidth = Math.max(1.5, pr * 0.03);
      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const wv = frame.wave[i % points]!;
        const a = (i / points) * 2 * Math.PI + ring.rot;
        const r = pr * (1 + wv * ring.amp * 0.3);
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r * 0.85;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    this.rings = this.rings.filter((ring) => ring.z > 0.12);
  }
}

/**
 * PLASMA: two interference fields composited for depth. A slow, deep
 * indigo background layer drifts beneath a bright audio-bent foreground,
 * and a radial vignette curves the edges away. Band energies bend the
 * foreground's spatial frequencies; beats flash its lightness.
 */
class PlasmaScene implements Scene {
  readonly name = 'Plasma';
  private front: HTMLCanvasElement | null = null;
  private back: HTMLCanvasElement | null = null;
  private frontImage: ImageData | null = null;
  private backImage: ImageData | null = null;
  private vignette: CanvasGradient | null = null;
  private vignetteFor = '';

  render(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    _frame: VisFrameEvent,
    f: SpectralFeatures,
    t: number,
    _dt: number,
  ): void {
    const FW = 168;
    const FH = 96;
    const BW = 84;
    const BH = 48;
    if (this.front === null) {
      this.front = document.createElement('canvas');
      this.front.width = FW;
      this.front.height = FH;
      this.back = document.createElement('canvas');
      this.back.width = BW;
      this.back.height = BH;
    }
    const ts = t * 0.001;

    // deep layer: slow, dark, blue-violet, drifting the other way
    const bctx = this.back!.getContext('2d') as CanvasRenderingContext2D;
    this.backImage ??= bctx.createImageData(BW, BH);
    const bp = this.backImage.data;
    for (let y = 0; y < BH; y++) {
      for (let x = 0; x < BW; x++) {
        const v =
          Math.sin(x * 0.13 - ts * 0.4) +
          Math.sin(y * 0.17 + ts * 0.31) +
          Math.sin((x - y) * 0.09 - ts * 0.22);
        const hue = 245 + v * 18;
        const [r, g, b] = hslToRgb(((hue + 360) % 360) / 360, 0.7, 0.1 + (v + 3) * 0.03);
        const i = (y * BW + x) * 4;
        bp[i] = r;
        bp[i + 1] = g;
        bp[i + 2] = b;
        bp[i + 3] = 255;
      }
    }
    bctx.putImageData(this.backImage, 0, 0);

    // foreground: audio-bent field with a drifting rainbow palette
    const fctx = this.front!.getContext('2d') as CanvasRenderingContext2D;
    this.frontImage ??= fctx.createImageData(FW, FH);
    const fp = this.frontImage.data;
    const a = 0.09 + f.bass * 0.12;
    const b2 = 0.11 + f.mid * 0.1;
    const c = 0.07 + f.treble * 0.16;
    // palette anchored to the music's brightness, drifting slowly
    const baseHue = (25 + f.centroid * 275 + ts * 6) % 360;
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < FW; x++) {
        const dx = x - FW / 2;
        const dy = y - FH / 2;
        const v =
          Math.sin(x * a + ts) +
          Math.sin(y * b2 - ts * 1.31) +
          Math.sin((x + y) * c * 0.6 + ts * 0.7) +
          Math.sin(Math.sqrt(dx * dx + dy * dy) * (0.15 + f.beat * 0.1) - ts * 2);
        const hue = (baseHue + v * 34 + 360) % 360;
        const light = 0.18 + (v + 4) * 0.05 + f.beat * 0.16 + f.loudness * 0.22;
        const [r, g, b] = hslToRgb(hue / 360, 0.9, Math.min(0.7, light));
        const i = (y * FW + x) * 4;
        fp[i] = r;
        fp[i + 1] = g;
        fp[i + 2] = b;
        fp[i + 3] = 255;
      }
    }
    fctx.putImageData(this.frontImage, 0, 0);

    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 1;
    ctx.drawImage(this.back!, 0, 0, w, h);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.85;
    ctx.drawImage(this.front!, 0, 0, w, h);
    ctx.globalAlpha = 1;

    // vignette curves the edges into darkness
    const key = `${w}x${h}`;
    if (this.vignette === null || this.vignetteFor !== key) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,8,0.75)');
      this.vignette = g;
      this.vignetteFor = key;
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, w, h);
  }
}

/**
 * SWARM: particles in a swirl field across three parallax depth layers.
 * Distance scales speed, size, and brightness; hue comes from each
 * particle's angle around the center, so the swarm is a rotating color
 * wheel. Mids drive the swirl, beats fire radial shockwaves.
 */
class SwarmScene implements Scene {
  readonly name = 'Swarm';
  private particles: Array<{ x: number; y: number; vx: number; vy: number; z: number }> = [];

  render(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    _frame: VisFrameEvent,
    f: SpectralFeatures,
    t: number,
    dt: number,
  ): void {
    const dtn = Math.min(6, dt / 16.7);
    if (this.particles.length === 0) {
      for (let i = 0; i < 460; i++) {
        this.particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: 0,
          vy: 0,
          z: 0.55 + Math.random() * 1.65, // 0.55 near .. 2.2 far
        });
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(3, 3, 12, ${Math.min(0.5, 0.16 * dtn)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    const cx = w / 2;
    const cy = h / 2;
    const swirl = 0.9 + f.mid * 6;
    const pull = 0.012 + f.treble * 0.02;
    const kick = f.beat * 3.2;
    const scale = Math.min(w, h) / 500;
    const hueSpin = t * 0.012;

    for (const p of this.particles) {
      const depth = 1 / p.z; // near = big/fast/bright
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d = Math.max(20, Math.hypot(dx, dy));
      const target = Math.min(w, h) * (0.16 + f.bass * 0.36) * p.z * 0.7;
      const radial = (target - d) * pull + kick;
      p.vx += ((-dy / d) * swirl * 0.05 * scale + (dx / d) * radial * 0.08) * dtn * depth;
      p.vy += ((dx / d) * swirl * 0.05 * scale + (dy / d) * radial * 0.08) * dtn * depth;
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
      const angle = Math.atan2(dy, dx);
      // color wheel offset by the music's brightness; quiet passages dim
      const hue = ((angle * 180) / Math.PI + hueSpin + f.centroid * 120 + 360) % 360;
      const light =
        (30 + Math.min(1, speed / (6 * scale)) * 28 + f.beat * 18) * (0.5 + f.loudness * 1.4);
      ctx.fillStyle = `hsla(${hue}, ${70 + depth * 25}%, ${light * Math.min(1, depth + 0.35)}%, ${0.35 + depth * 0.5})`;
      const size = Math.max(1.2, (1.4 + speed * 0.35) * scale * depth * 1.6);
      ctx.fillRect(p.x, p.y, size, size);
    }
  }
}

/**
 * FRACTAL: an escape-time Julia set whose seed rides the Mandelbrot
 * boundary, c = r * e^(i theta) with r near 0.7885, where the set stays
 * connected and endlessly reshapes. Mids steer the orbit, bass breathes
 * the radius, beats punch the zoom, the palette follows the music's
 * brightness, and smooth (fractional) escape counts kill the banding.
 * Rendered into a small buffer and upscaled, like Plasma.
 */
class FractalScene implements Scene {
  readonly name = 'Fractal';
  private buf: HTMLCanvasElement | null = null;
  private image: ImageData | null = null;
  private theta = 2.05; // orbit position along the boundary
  private zoomPunch = 0;

  render(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    _frame: VisFrameEvent,
    f: SpectralFeatures,
    t: number,
    dt: number,
  ): void {
    const FW = 192;
    const FH = 108;
    const dtn = Math.min(6, dt / 16.7);
    if (this.buf === null) {
      this.buf = document.createElement('canvas');
      this.buf.width = FW;
      this.buf.height = FH;
    }
    const bctx = this.buf.getContext('2d') as CanvasRenderingContext2D;
    this.image ??= bctx.createImageData(FW, FH);
    const px = this.image.data;

    this.theta += (0.0016 + f.mid * 0.007) * dtn;
    const r = 0.7885 + Math.sin(t * 0.00013) * 0.015 + f.bass * 0.018;
    const cr = r * Math.cos(this.theta);
    const ci = r * Math.sin(this.theta);
    this.zoomPunch = Math.max(f.beat, this.zoomPunch * Math.pow(0.965, dtn));
    const scale = 1.35 / (1 + this.zoomPunch * 0.35 + f.loudness * 0.1);
    const aspect = FW / FH;
    const maxIter = 48;
    const baseHue = (25 + f.centroid * 275 + t * 0.006) % 360;
    const glow = 0.5 + f.loudness * 0.5;

    for (let y = 0; y < FH; y++) {
      const zy0 = (y / FH - 0.5) * 2 * scale;
      for (let x = 0; x < FW; x++) {
        let zx = (x / FW - 0.5) * 2 * scale * aspect;
        let zy = zy0;
        let i = 0;
        let zx2 = zx * zx;
        let zy2 = zy * zy;
        while (i < maxIter && zx2 + zy2 < 4) {
          zy = 2 * zx * zy + ci;
          zx = zx2 - zy2 + cr;
          zx2 = zx * zx;
          zy2 = zy * zy;
          i++;
        }
        const o = (y * FW + x) * 4;
        if (i >= maxIter) {
          // inside the set: near-black, warmed slightly by beats
          const [rr, gg, bb] = hslToRgb(baseHue / 360, 0.8, 0.02 + f.beat * 0.05);
          px[o] = rr;
          px[o + 1] = gg;
          px[o + 2] = bb;
        } else {
          // fractional escape count for smooth gradients; the power
          // curve keeps the far field dark so the filaments burn
          const nu = i + 1 - Math.log2(Math.max(1e-9, Math.log(Math.sqrt(zx2 + zy2))));
          const v = Math.min(1, Math.max(0, nu / maxIter));
          const hue = (baseHue + v * 150 + 360) % 360;
          const light = Math.min(0.72, 0.015 + Math.pow(v, 1.9) * glow + f.beat * 0.08);
          const [rr, gg, bb] = hslToRgb(hue / 360, 0.9, light);
          px[o] = rr;
          px[o + 1] = gg;
          px[o + 2] = bb;
        }
        px[o + 3] = 255;
      }
    }
    bctx.putImageData(this.image, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 1;
    ctx.drawImage(this.buf, 0, 0, w, h);
  }
}

export function createScenes(): Scene[] {
  return [new TunnelScene(), new PlasmaScene(), new SwarmScene(), new FractalScene()];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number): number => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
