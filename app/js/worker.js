// V0.41: CorAnTool background worker — enhancement and detection off the main thread (the interface no longer freezes
// for 1–3 s on large images). Uses the same pure functions as the main thread, so results are identical.
import { applyFilters, detectMask, components } from './imageproc.js';

self.onmessage = (e) => {
  const { id, op, a } = e.data;
  try {
    if (op === 'filters') {
      const r = applyFilters(a.rgba, a.w, a.h, a.f);
      self.postMessage({ id, r }, [r.buffer]);
    } else if (op === 'detect') {
      const m = detectMask(a.enh, a.w, a.h, a.roi, a.exclude, a.p, a.prob);
      const r = components(m, a.w, a.h, a.p.minArea);
      self.postMessage({ id, r }, [r.labels.buffer]);
    } else throw new Error('unknown op ' + op);
  } catch (err) { self.postMessage({ id, err: String(err?.message || err) }); }
};
