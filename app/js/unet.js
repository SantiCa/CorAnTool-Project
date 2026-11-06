import { topAt } from './core.js';
// V0.15: learned segmentation (U-Net) in the app — DOM-free and independent of the inference engine.
// The same tiling, normalisation, blending, resampling and training-mask rules are implemented in
// src/sedcoretool/unet/tiling.py; tests in both languages check identical values.

/** Default model description (overridden by the model's JSON written by `sedcoretool unet train`). */
export const UNET_DEFAULTS = { tile: 512, overlap: 64, mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225], pxPerCm: null, classes: ['bioturbation'], output: 'logits' };
/** Label value for pixels that must not be used for training or scoring (excluded zones, unreviewed candidates). */
export const IGNORE = 255;

/** Tile start positions along one axis: step tile − overlap, last tile flush with the end; one tile if len ≤ tile. */
export function tileStarts(len, tile, overlap) {
  if (len <= tile) return [0];
  const step = Math.max(1, tile - overlap), out = [];
  for (let s = 0; s + tile < len; s += step) out.push(s);
  if (out[out.length - 1] !== len - tile) out.push(len - tile);
  return out;
}

/** 1-D blending weight: linear ramp over `overlap` pixels at both ends, 1 in the centre. */
export function blendWindow(tile, overlap) {
  const w = new Float32Array(tile);
  for (let i = 0; i < tile; i++) w[i] = overlap > 0 ? Math.min(1, (i + 0.5) / overlap, (tile - i - 0.5) / overlap) : 1;
  return w;
}

/** Copy of the ROI of an RGBA image. */
export function cropRGBA(rgba, w, roi) {
  const cw = roi.x1 - roi.x0, ch = roi.y1 - roi.y0, out = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) out.set(rgba.subarray(((roi.y0 + y) * w + roi.x0) * 4, ((roi.y0 + y) * w + roi.x1) * 4), y * cw * 4);
  return out;
}

/** Bilinear resampling of `c` interleaved channels (pixel centres aligned: xs = (x + 0.5)·w/W − 0.5, clamped). */
export function resampleBilinear(src, w, h, c, W, H) {
  const Out = src instanceof Float32Array ? Float32Array : Uint8ClampedArray, out = new Out(W * H * c);
  const sx = w / W, sy = h / H;
  for (let y = 0; y < H; y++) {
    const fy = Math.min(h - 1, Math.max(0, (y + 0.5) * sy - 0.5)), y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(w - 1, Math.max(0, (x + 0.5) * sx - 0.5)), x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
      for (let k = 0; k < c; k++) {
        const a = src[(y0 * w + x0) * c + k], b = src[(y0 * w + x1) * c + k], d = src[(y1 * w + x0) * c + k], e = src[(y1 * w + x1) * c + k];
        out[(y * W + x) * c + k] = (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty;
      }
    }
  }
  return out;
}

/** Network input (NCHW float32, 3 channels) for the tile at (x0, y0); coordinates outside the image are clamped (edge padding). */
export function tileInput(rgba, w, h, x0, y0, tile, mean, std) {
  const n = tile * tile, out = new Float32Array(3 * n);
  for (let y = 0; y < tile; y++) {
    const yy = Math.min(h - 1, y0 + y);
    for (let x = 0; x < tile; x++) {
      const j = (yy * w + Math.min(w - 1, x0 + x)) * 4, i = y * tile + x;
      for (let c = 0; c < 3; c++) out[c * n + i] = (rgba[j + c] / 255 - mean[c]) / std[c];
    }
  }
  return out;
}

/** Network output of one tile (C × tile × tile) to per-pixel probabilities: sigmoid (C = 1) or softmax (C > 1) of logits. */
export function toProbs(out, C, n, logits = true) {
  const p = new Float32Array(C * n);
  if (!logits) { p.set(out.subarray(0, C * n)); return p; }
  if (C === 1) { for (let i = 0; i < n; i++) p[i] = 1 / (1 + Math.exp(-out[i])); return p; }
  for (let i = 0; i < n; i++) {
    let m = -Infinity; for (let c = 0; c < C; c++) m = Math.max(m, out[c * n + i]);
    let s = 0; for (let c = 0; c < C; c++) { const e = Math.exp(out[c * n + i] - m); p[c * n + i] = e; s += e; }
    for (let c = 0; c < C; c++) p[c * n + i] /= s;
  }
  return p;
}

/**
 * Probability of bioturbation over the ROI. `run(input, tile)` returns { data, channels } for one tile (logits or
 * probabilities as cfg.output says). `scale` = model px/cm ÷ image px/cm (1 = no resampling).
 * Returns { prob: Float32Array(w·h) (0 outside the ROI), cls: Uint8Array(w·h) | null (argmax class 1..C−1 for C > 1) }.
 */
export async function predictProb(run, rgba, w, h, roi, cfg = {}, scale = 1, onTile = null) {
  const c = { ...UNET_DEFAULTS, ...cfg }, T = c.tile;
  const cw = roi.x1 - roi.x0, chh = roi.y1 - roi.y0;
  let img = cropRGBA(rgba, w, roi), W = cw, H = chh;
  if (Math.abs(scale - 1) > 0.02) { W = Math.max(1, Math.round(cw * scale)); H = Math.max(1, Math.round(chh * scale)); img = resampleBilinear(img, cw, chh, 4, W, H); }
  const xs = tileStarts(W, T, c.overlap), ys = tileStarts(H, T, c.overlap), win = blendWindow(T, c.overlap), n = T * T;
  let C = 0, acc = null; const wsum = new Float32Array(W * H);
  let done = 0;
  for (const y0 of ys) for (const x0 of xs) {
    const r = await run(tileInput(img, W, H, x0, y0, T, c.mean, c.std), T);
    if (!C) { C = r.channels; acc = new Float32Array(W * H * C); }
    const p = toProbs(r.data, C, n, c.output !== 'probs');
    for (let y = 0; y < T && y0 + y < H; y++) for (let x = 0; x < T && x0 + x < W; x++) {
      const q = (y0 + y) * W + x0 + x, wt = win[y] * win[x], i = y * T + x;
      wsum[q] += wt; for (let k = 0; k < C; k++) acc[q * C + k] += wt * p[k * n + i];
    }
    if (onTile) onTile(++done, xs.length * ys.length);
  }
  for (let q = 0; q < W * H; q++) for (let k = 0; k < C; k++) acc[q * C + k] /= wsum[q] || 1;
  const planes = W === cw && H === chh ? acc : resampleBilinear(acc, W, H, C, cw, chh);
  const prob = new Float32Array(w * h), cls = C > 1 ? new Uint8Array(w * h) : null;
  for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
    const q = (y * cw + x) * C, i = (roi.y0 + y) * w + roi.x0 + x;
    if (C === 1) { prob[i] = planes[q]; continue; }
    prob[i] = 1 - planes[q];
    let best = 1; for (let k = 2; k < C; k++) if (planes[q + k] > planes[q + best]) best = k;
    cls[i] = best;
  }
  return { prob, cls };
}

/** Pixels whose probability is within `band` of 0.5 (the model's doubtful zone). */
export const doubtful = (p, band = 0.2) => Math.abs(p - 0.5) < band;

/**
 * Training mask of the ROI: object class index + 1 for reviewed traces, 0 for matrix and artefacts,
 * IGNORE for excluded pixels and for objects without a confirmed class. objLabel[id] = value for object id
 * (k ≥ 1 class, 0 matrix/artefact, −1 ignore).
 */
export function trainingMask(labels, w, roi, exclude, objLabel, stacks = null) {   // V0.20: an overlap takes its top object
  const cw = roi.x1 - roi.x0, ch = roi.y1 - roi.y0, out = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const i = (roi.y0 + y) * w + roi.x0 + x, id = stacks ? topAt(labels[i], stacks) : labels[i];
    if (exclude && exclude[i]) { out[y * cw + x] = IGNORE; continue; }
    const v = id ? (objLabel[id] ?? -1) : 0;
    out[y * cw + x] = v < 0 ? IGNORE : v;
  }
  return out;
}

/** Most frequent U-Net class among the pixels of each object: Map id → { k, frac }. */
export function objectClasses(labels, cls, ids) {
  const cnt = new Map();
  for (let i = 0; i < labels.length; i++) {
    const id = labels[i]; if (!id || !ids.has(id) || !cls[i]) continue;
    let m = cnt.get(id); if (!m) cnt.set(id, (m = new Map()));
    m.set(cls[i], (m.get(cls[i]) || 0) + 1);
  }
  const out = new Map();
  for (const [id, m] of cnt) {
    let k = 0, best = 0, tot = 0; for (const [c, v] of m) { tot += v; if (v > best) { best = v; k = c; } }
    out.set(id, { k, frac: best / tot });
  }
  return out;
}
