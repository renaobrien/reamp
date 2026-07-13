/**
 * The Sharp player: Reamp's own vector-drawn player face, crisp at any
 * size. Classic .wsz skins are 1998 bitmaps, so scaling them is always
 * chunky or soft; this face is CSS, SVG seven-segment digits, and a
 * native-resolution vis canvas, so one font-size knob scales it losslessly.
 *
 * Skin IP note (CLAUDE.md rule 6): nothing here copies Winamp art. The
 * layout is a homage, the pixels are ours.
 */
import type { ReampApi } from '../preload.js';
import type { TransportCommand } from '../shared/ipc.js';
import { ClassicVis } from './classic-vis.js';

/** Seven segments per digit: a top, b tr, c br, d bottom, e bl, f tl, g mid. */
const SEGMENT_MAP: Record<string, number[]> = {
  '0': [1, 1, 1, 1, 1, 1, 0],
  '1': [0, 1, 1, 0, 0, 0, 0],
  '2': [1, 1, 0, 1, 1, 0, 1],
  '3': [1, 1, 1, 1, 0, 0, 1],
  '4': [0, 1, 1, 0, 0, 1, 1],
  '5': [1, 0, 1, 1, 0, 1, 1],
  '6': [1, 0, 1, 1, 1, 1, 1],
  '7': [1, 1, 1, 0, 0, 0, 0],
  '8': [1, 1, 1, 1, 1, 1, 1],
  '9': [1, 1, 1, 1, 0, 1, 1],
};

/** rect x, y, w, h per segment on a 10x18 grid. */
const SEGMENT_RECTS = [
  [2, 0, 6, 2],
  [8, 1, 2, 7],
  [8, 10, 2, 7],
  [2, 16, 6, 2],
  [0, 10, 2, 7],
  [0, 1, 2, 7],
  [2, 8, 6, 2],
];

const SVG_NS = 'http://www.w3.org/2000/svg';

function makeDigit(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 10 18');
  svg.classList.add('sp-digit');
  for (const [x, y, w, h] of SEGMENT_RECTS) {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(w));
    rect.setAttribute('height', String(h));
    svg.appendChild(rect);
  }
  return svg;
}

function setDigit(svg: SVGSVGElement, ch: string): void {
  const map = SEGMENT_MAP[ch] ?? [0, 0, 0, 0, 0, 0, 0];
  svg.querySelectorAll('rect').forEach((rect, i) => {
    rect.setAttribute('class', map[i] === 1 ? 'on' : 'off');
  });
}

export interface SharpPlayerOptions {
  host: HTMLElement;
  bridge: ReampApi;
  send: (cmd: TransportCommand) => void;
}

export class SharpPlayer {
  readonly root: HTMLDivElement;
  private readonly digits: SVGSVGElement[] = [];
  private readonly vis: ClassicVis;
  private scale = 2;
  private playing = false;
  private durationMs = 0;
  private seeking = false;

  constructor(opts: SharpPlayerOptions) {
    const { bridge, send } = opts;
    this.root = document.createElement('div');
    this.root.id = 'sharp-player';
    this.root.innerHTML = `
      <div class="sp-header"><span>REAMP</span><span class="sp-meta">STEREO · LOOPBACK</span></div>
      <div class="sp-display">
        <div class="sp-time" title="Track position"></div>
        <div class="sp-right">
          <div class="sp-marquee" title="Now playing">Play something in Spotify or Music</div>
          <canvas class="sp-vis" title="Click to flip spectrum / oscilloscope"></canvas>
        </div>
      </div>
      <input class="sp-seek" type="range" min="0" max="1000" value="0" title="Seek" />
      <div class="sp-controls">
        <span class="btn-group">
          <button data-cmd="previous" title="Previous track (Left arrow)">⏮</button>
          <button class="sp-playpause" title="Play or pause (Space)">▶</button>
          <button data-cmd="next" title="Next track (Right arrow)">⏭</button>
        </span>
        <span class="btn-group">
          <button class="sp-shuffle" title="Shuffle">shuf</button>
          <button class="sp-repeat" title="Repeat">rep</button>
        </span>
        <input class="sp-volume" type="range" min="0" max="100" value="80" title="Volume" />
      </div>`;
    opts.host.appendChild(this.root);

    // mm:ss as four seven-segment digits around a colon
    const time = this.root.querySelector('.sp-time') as HTMLElement;
    for (let i = 0; i < 4; i++) {
      if (i === 2) {
        const colon = document.createElement('span');
        colon.className = 'sp-colon';
        colon.textContent = ':';
        time.appendChild(colon);
      }
      const digit = makeDigit();
      this.digits.push(digit);
      time.appendChild(digit);
    }
    this.renderTime(0);

    const visCanvas = this.root.querySelector('.sp-vis') as HTMLCanvasElement;
    this.vis = new ClassicVis(visCanvas);
    new ResizeObserver(() => {
      this.vis.resize(
        visCanvas.clientWidth * devicePixelRatio,
        visCanvas.clientHeight * devicePixelRatio,
      );
    }).observe(visCanvas);
    let visMode: 'bars' | 'scope' = 'bars';
    visCanvas.addEventListener('click', () => {
      visMode = visMode === 'bars' ? 'scope' : 'bars';
      this.vis.setMode(visMode);
    });
    bridge.onVisFrame((frame) => {
      if (!this.root.hidden) this.vis.render(frame);
    });

    // transport wiring: buttons carry their command, toggles read state
    this.root.querySelectorAll<HTMLButtonElement>('[data-cmd]').forEach((btn) => {
      btn.addEventListener('click', () =>
        send({ action: btn.dataset['cmd'] as 'previous' | 'next' }),
      );
    });
    const playpause = this.root.querySelector('.sp-playpause') as HTMLButtonElement;
    playpause.addEventListener('click', () =>
      send(this.playing ? { action: 'pause' } : { action: 'play' }),
    );
    const shuffle = this.root.querySelector('.sp-shuffle') as HTMLButtonElement;
    shuffle.addEventListener('click', () =>
      send({ action: 'setShuffle', on: shuffle.getAttribute('aria-pressed') !== 'true' }),
    );
    const repeat = this.root.querySelector('.sp-repeat') as HTMLButtonElement;
    repeat.addEventListener('click', () =>
      send({
        action: 'setRepeat',
        mode: repeat.getAttribute('aria-pressed') === 'true' ? 'off' : 'context',
      }),
    );

    const seek = this.root.querySelector('.sp-seek') as HTMLInputElement;
    seek.addEventListener('pointerdown', () => (this.seeking = true));
    seek.addEventListener('change', () => {
      this.seeking = false;
      if (this.durationMs > 0) {
        send({ action: 'seek', ms: Math.round((Number(seek.value) / 1000) * this.durationMs) });
      }
    });
    const volume = this.root.querySelector('.sp-volume') as HTMLInputElement;
    volume.addEventListener('change', () => send({ action: 'setVolume', pct: Number(volume.value) }));

    bridge.onPlayerState(({ state }) => {
      this.playing = state.playing;
      this.durationMs = state.track.durationMs;
      (this.root.querySelector('.sp-marquee') as HTMLElement).textContent =
        `${state.track.artist} - ${state.track.title}`;
      playpause.textContent = state.playing ? '❚❚' : '▶';
      shuffle.setAttribute('aria-pressed', String(state.shuffle));
      repeat.setAttribute('aria-pressed', String(state.repeat !== 'off'));
      this.renderTime(state.positionMs);
      if (!this.seeking && state.track.durationMs > 0) {
        seek.value = String(Math.round((state.positionMs / state.track.durationMs) * 1000));
      }
      if (document.activeElement !== volume) volume.value = String(Math.round(state.volume));
    });
  }

  /** One knob: everything inside is em-sized, so this is lossless. */
  setScale(scale: number): void {
    this.scale = scale;
    this.root.style.fontSize = `${scale * 7}px`;
  }

  /** Unscaled footprint, for fit computations. */
  naturalSize(): { w: number; h: number } {
    const rect = this.root.getBoundingClientRect();
    if (rect.width > 0) return { w: rect.width / this.scale, h: rect.height / this.scale };
    return { w: 290, h: 120 }; // hidden: close enough for a first fit
  }

  private renderTime(positionMs: number): void {
    const totalSeconds = Math.max(0, Math.floor(positionMs / 1000));
    const minutes = Math.min(99, Math.floor(totalSeconds / 60));
    const seconds = totalSeconds % 60;
    const text = `${String(minutes).padStart(2, '0')}${String(seconds).padStart(2, '0')}`;
    this.digits.forEach((digit, i) => setDigit(digit, text[i]!));
  }
}
