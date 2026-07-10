/**
 * Waveform downsampling for the classic oscilloscope vis. Winamp's scope
 * draws one waveform value per column; we stride-sample the latest PCM
 * window (mean would flatten the shape) and clamp to [-1, 1].
 */
export function waveformPoints(
  pcm: Float32Array,
  points: number,
  out?: Float32Array,
): Float32Array {
  if (points < 1) throw new Error('points must be >= 1');
  const result = out ?? new Float32Array(points);
  if (result.length < points) throw new Error('out array too small');
  if (pcm.length === 0) {
    result.fill(0, 0, points);
    return result;
  }
  const stride = pcm.length / points;
  for (let i = 0; i < points; i++) {
    const v = pcm[Math.min(pcm.length - 1, Math.floor(i * stride))]!;
    result[i] = v > 1 ? 1 : v < -1 ? -1 : v;
  }
  return result;
}
