// V0.17: descriptors of each trace from a pre-trained vision model (DINOv2), for the ichnotaxon classifier.
// DOM-free and independent of the inference engine. The model is not trained here: it turns the image of a
// trace into a vector of numbers ("embedding"); the existing k-NN / Random Forest / Bayes learn from those vectors.

/** Default model: DINOv2 ViT-S/14 (Oquab et al., 2024) exported to ONNX by the Hugging Face onnx-community. */
export const VISION_MODEL = {
  id: 'dinov2-small', name: 'DINOv2 ViT-S/14', size: 224, dim: 384, mb: 88,
  url: 'https://huggingface.co/onnx-community/dinov2-small/resolve/main/onnx/model.onnx',
  mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225], pad: 0.25,
};
/** Name of the feature set stored with models and examples (vectors of different sets are never mixed). */
export const visionFeatureId = (m = VISION_MODEL) => [`vision:${m.id}:${m.dim}`];

/**
 * Square window around a trace: its bounding box [x0, y0, x1, y1] (inclusive) enlarged by `pad` of its larger
 * side on every side (context of the host sediment), at least `minSide` px; may extend past the image (edge padding).
 */
export function traceWindow(bbox, pad = 0.25, minSide = 16) {
  const [x0, y0, x1, y1] = bbox, bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const side = Math.max(minSide, Math.round(Math.max(bw, bh) * (1 + 2 * pad)));
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
  return { x: Math.round(cx - side / 2), y: Math.round(cy - side / 2), side };
}

/** Network input (1 × 3 × size × size, float32): bilinear resampling of the window, ImageNet normalisation. */
export function traceInput(rgba, w, h, win, m = VISION_MODEL) {
  const S = m.size, n = S * S, out = new Float32Array(3 * n), k = win.side / S;
  for (let y = 0; y < S; y++) {
    const fy = Math.min(h - 1, Math.max(0, win.y + (y + 0.5) * k - 0.5)), y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < S; x++) {
      const fx = Math.min(w - 1, Math.max(0, win.x + (x + 0.5) * k - 0.5)), x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
      for (let c = 0; c < 3; c++) {
        const a = rgba[(y0 * w + x0) * 4 + c], b = rgba[(y0 * w + x1) * 4 + c], d = rgba[(y1 * w + x0) * 4 + c], e = rgba[(y1 * w + x1) * 4 + c];
        const v = ((a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty) / 255;
        out[c * n + y * S + x] = (v - m.mean[c]) / m.std[c];
      }
    }
  }
  return out;
}

/**
 * Embedding from the model outputs ({name: {data, dims}}): `pooler_output` if present, else the first output
 * (first token of a [1, tokens, dim] output = class token). Unit length (L2), rounded to 4 decimals for storage.
 */
export function pickEmbedding(outputs, names) {
  const name = names.includes('pooler_output') ? 'pooler_output' : names[0], o = outputs[name];
  const dim = o.dims[o.dims.length - 1], v = Array.from(o.data.subarray ? o.data.subarray(0, dim) : o.data.slice(0, dim));
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => +(x / norm).toFixed(4));
}
