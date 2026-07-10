/**
 * Hand-written declarations for the untyped butterchurn packages,
 * matching what butterchurn@2.6.7 actually ships (verified against
 * lib/butterchurn.js): createVisualizer accepts a null AudioContext,
 * and render() accepts raw 1024-sample, 128-centered byte arrays via
 * audioLevels, which is how Reamp feeds loopback PCM without any
 * Web Audio graph.
 */
declare module 'butterchurn' {
  export interface ButterchurnAudioLevels {
    timeByteArray: Uint8Array;
    timeByteArrayL: Uint8Array;
    timeByteArrayR: Uint8Array;
  }

  export interface ButterchurnVisualizer {
    render(opts?: { audioLevels?: ButterchurnAudioLevels; elapsedTime?: number }): void;
    loadPreset(preset: object, blendTime?: number): void;
    setRendererSize(width: number, height: number): void;
    launchSongTitleAnim(text: string): void;
  }

  const butterchurn: {
    createVisualizer(
      context: AudioContext | null,
      canvas: HTMLCanvasElement,
      opts: { width: number; height: number; pixelRatio?: number; textureRatio?: number },
    ): ButterchurnVisualizer;
  };
  export default butterchurn;
}

declare module 'butterchurn-presets' {
  const pack: { getPresets(): Record<string, object> };
  export default pack;
}

declare module 'butterchurn-presets/lib/butterchurnPresetsExtra.min.js' {
  const pack: { getPresets(): Record<string, object> };
  export default pack;
}
