// SedCoreTool web — incremental learning of trace-fossil classes from labelled objects.
// Distance-weighted k-nearest neighbours on standardised shape/colour descriptors:
// it learns from the first few examples, needs no training step, and refuses to
// label objects that look unlike anything seen so far (novelty gate).

export const FEATURES = ['logArea', 'logMajor', 'logMinor', 'elong', 'vert', 'compact', 'fill', 'meanL', 'stdL', 'meanA', 'meanB', 'contrast'];

/** Leave-one-out uses at most this many examples (evenly spaced). */
export const LOO_MAX = 1500;

export const vec = (f) => FEATURES.map((k) => (Number.isFinite(f?.[k]) ? f[k] : 0));

/** External examples cannot be proven independent of a reserved core, including copies in other projects. */
export function independentExternalExamples(examples, hasHoldout) {
  return hasHoldout ? [] : examples;
}

export class Classifier {
  /** V0.17: `features` names the input vector (FEATURES, or a vision-model id); its length is taken from the examples. */
  constructor({ k = 5, novelty = 3, weights = 'distance', features = FEATURES } = {}) { this.k = k; this.novelty = novelty; this.weights = weights; this.features = features; this.n = 0; }

  fit(examples) {
    this.n = examples.length;
    this.X = examples.map((e) => e.x);
    this.g = examples.map((e) => e.g ?? null); // group (image section): leave-one-out leaves out the whole group
    this.y = examples.map((e) => e.y);
    this.counts = {};
    for (const y of this.y) this.counts[y] = (this.counts[y] || 0) + 1;
    if (this.n < 2) { this.accuracy = null; return this; }
    const d = examples[0].x.length;
    this.mu = new Array(d).fill(0); this.sd = new Array(d).fill(0);
    for (const e of examples) e.x.forEach((v, j) => (this.mu[j] += v / this.n));
    for (const e of examples) e.x.forEach((v, j) => (this.sd[j] += (v - this.mu[j]) ** 2 / this.n));
    this.sd = this.sd.map((s) => Math.sqrt(s) || 1);
    this.Z = examples.map((e) => this.z(e.x));
    // Leave-one-out: typical nearest-neighbour distance (novelty scale) and accuracy estimate.
    // (at most LOO_MAX evenly spaced examples, so that very large libraries stay fast)
    const nn = [], ok = [], step = Math.max(1, this.n / LOO_MAX), useG = new Set(this.g.filter((v) => v != null)).size >= 2;
    this.grouped = useG;
    for (let f = 0; f < this.n; f += step) {
      const i = Math.floor(f);
      const r = this.vote(this.Z[i], i);
      nn.push(r.dmin); // novelty scale: nearest other example, whatever its group
      // accuracy: leaving out the whole group (image section) when there are several groups, else the example alone
      const rg = useG ? this.vote(this.Z[i], i, this.g[i]) : r;
      if (Object.keys(this.counts).length > 1 && rg.y != null) ok.push(rg.y === this.y[i] ? 1 : 0);
    }
    nn.sort((a, b) => a - b);
    this.scale = nn[nn.length >> 1] || 1;
    this.accuracy = ok.length ? ok.reduce((s, v) => s + v, 0) / ok.length : null;
    return this;
  }

  z(x) { return x.map((v, j) => (v - this.mu[j]) / this.sd[j]); }

  vote(z, skip = -1, group = null) {
    const best = [];
    for (let i = 0; i < this.n; i++) {
      if (i === skip || (group != null && this.g?.[i] === group)) continue;
      const zi = this.Z[i]; let s = 0;
      for (let j = 0; j < zi.length; j++) { const t = zi[j] - z[j]; s += t * t; }
      const d = Math.sqrt(s);
      if (best.length < this.k) { best.push([d, i]); best.sort((a, b) => a[0] - b[0]); }
      else if (d < best[best.length - 1][0]) { best[best.length - 1] = [d, i]; best.sort((a, b) => a[0] - b[0]); }
    }
    const votes = {}; let tot = 0;
    for (const [d, i] of best) { const wgt = this.weights === 'uniform' ? 1 : 1 / (d + 0.05); votes[this.y[i]] = (votes[this.y[i]] || 0) + wgt; tot += wgt; }
    let y = null, v = -1;
    for (const [k, s] of Object.entries(votes)) if (s > v) { y = k; v = s; }
    const probs = {};
    for (const [k, s] of Object.entries(votes)) probs[k] = tot ? s / tot : 0;
    return { y, conf: tot ? v / tot : 0, probs, dmin: best.length ? best[0][0] : Infinity };
  }

  /**
   * Returns {y, conf, probs} (probs = share of the distance-weighted vote of each class among the k neighbours),
   * {y: null, novel: true, probs} for an object unlike any example, or null with fewer than 2 examples.
   */
  predict(x) {
    if (this.n < 2) return null;
    const r = this.vote(this.z(x));
    if (r.dmin > this.novelty * this.scale) return { y: null, conf: 0, novel: true, probs: r.probs };
    return r;
  }

  /** Stored model ("weights" of a k-NN model: standardisation, novelty scale and the examples). */
  toJSON() {
    const r5 = (v) => +v.toFixed(5);
    return { kind: 'knn', version: 1, k: this.k, novelty: this.novelty, weights: this.weights, n: this.n, features: this.features, mu: this.mu?.map(r5) || null, sd: this.sd?.map(r5) || null,
      scale: this.scale ?? null, accuracy: this.accuracy ?? null, counts: this.counts || {}, y: this.y || [], X: (this.X || []).map((x) => x.map(r5)) };
  }

  /** Model rebuilt from toJSON() without refitting (same standardisation, scale and examples). */
  static fromJSON(m, features = FEATURES) {
    const c = new Classifier({ k: m.k, novelty: m.novelty, weights: m.weights || 'distance', features });
    if (!m || !Array.isArray(m.X) || JSON.stringify(m.features) !== JSON.stringify(features)) return c;
    Object.assign(c, { n: m.n, y: m.y, X: m.X, counts: m.counts, scale: m.scale, accuracy: m.accuracy, mu: m.mu, sd: m.sd });
    if (c.n >= 2 && c.mu) c.Z = c.X.map((x) => c.z(x));
    return c;
  }
}

/* ───────── several methods for ichnotaxa (V18) ───────── */

/** Small seeded generator (mulberry32) so that evaluations can be repeated exactly. */
export function rng(seed = 42) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * Grouped folds: whole groups (image sections) go to one fold, so traces of the same section are never both trained
 * and tested. Groups are shuffled (seeded) and each one goes to the fold with fewest examples of its main class.
 * V0.37: with 2…k−1 groups, one fold per group (leave one group out); stratifiedFolds only with a single group.
 */
export function groupedFolds(y, groups, k = 5, seed = 42) {
  const ids = [...new Set(groups)];
  if (ids.length < 2) return stratifiedFolds(y, k, seed);
  if (ids.length < k) return ids.map((g) => groups.reduce((o, x, i) => (x === g && o.push(i), o), []));
  const r = rng(seed), by = new Map(ids.map((g) => [g, []]));
  groups.forEach((g, i) => by.get(g).push(i));
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const folds = Array.from({ length: k }, () => []), cnt = folds.map(() => ({}));
  ids.sort((a, b) => by.get(b).length - by.get(a).length);
  for (const g of ids) {
    const m = by.get(g), main = Object.entries(m.reduce((o, i) => ((o[y[i]] = (o[y[i]] || 0) + 1), o), {})).sort((a, b) => b[1] - a[1])[0][0];
    let best = 0; for (let f = 1; f < k; f++) if ((cnt[f][main] || 0) < (cnt[best][main] || 0) || ((cnt[f][main] || 0) === (cnt[best][main] || 0) && folds[f].length < folds[best].length)) best = f;
    folds[best].push(...m); for (const i of m) cnt[best][y[i]] = (cnt[best][y[i]] || 0) + 1;
  }
  return folds.filter((q) => q.length);
}

/** Stratified folds: indices of each class shuffled (seeded) and dealt round-robin into k folds. */
export function stratifiedFolds(y, k = 5, seed = 42) {
  const r = rng(seed), by = {}, folds = Array.from({ length: k }, () => []);
  y.forEach((c, i) => (by[c] ||= []).push(i));
  let f = 0;
  for (const c of Object.keys(by).sort()) {
    const ix = by[c];
    for (let i = ix.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ix[i], ix[j]] = [ix[j], ix[i]]; }
    for (const i of ix) { folds[f % k].push(i); f++; }
  }
  return folds.filter((q) => q.length);
}

/**
 * Model of ichnotaxa with a choice of method. A k-NN Classifier is always fitted: it gives the standardisation,
 * the novelty test and (for k-NN) the leave-one-out accuracy. With method 'rf' or 'nb' the class probabilities come
 * from a Random Forest or a Gaussian naive Bayes fitted on the standardised descriptors (fitFn/probaFn are injected:
 * geo.js fitModel/predictProba).
 * opt = {method: 'knn'|'rf'|'nb', k, weights, novelty, rf: {...}, nb: {...}, fitFn, probaFn, seed}
 */
export class TaxonModel {
  constructor(opt = {}) { this.opt = { method: 'knn', k: 5, weights: 'distance', novelty: 3, seed: 42, ...opt }; this.n = 0; this.knn = new Classifier(this.opt); }
  get method() { return this.opt.method; }
  fit(examples) {
    const o = this.opt;
    this.knn = new Classifier({ k: o.k, novelty: o.novelty, weights: o.weights, features: o.features || FEATURES }).fit(examples);
    this.n = this.knn.n; this.counts = this.knn.counts; this.ext = null;
    if (o.method !== 'knn' && this.n >= 2 && Object.keys(this.counts).length >= 2 && o.fitFn) {
      this.ext = o.fitFn(o.method, this.knn.Z, this.knn.y, o[o.method] || {}, o.seed);
    }
    this.accuracy = o.method === 'knn' ? this.knn.accuracy : (this.cv ?? null);
    return this;
  }
  set novelty(v) { this.opt.novelty = v; this.knn.novelty = v; }
  get scale() { return this.knn.scale; }
  /** {y, conf, probs, novel} like Classifier.predict; probabilities from the chosen method. */
  predict(x, { ignoreNovelty = false } = {}) {
    const base = this.knn.predict(x); if (!base) return null;
    let probs = base.probs;
    if (this.ext && this.opt.probaFn) probs = this.opt.probaFn(this.ext, this.knn.z(x));
    let y = null, v = -1; for (const [c, p] of Object.entries(probs)) if (p > v) { y = c; v = p; }
    const novel = !ignoreNovelty && !!base.novel;
    return { y: novel ? null : y, conf: novel ? 0 : v, probs, novel, dmin: base.dmin };
  }
  toJSON() { return { ...this.knn.toJSON(), method: this.opt.method, params: this.opt[this.opt.method] || {} }; }
}

/**
 * Compare methods and scopes on the same test examples (V18).
 * test = examples to predict ({key, y, x}); pools = {scope: examples available for training}; each fold removes its
 * test examples (by key) from every pool, so all scopes are judged on the same traces.
 * Returns {scope: {method: {accuracy, balanced, classes, cm, n}}}.
 */
export function evaluateModels({ test, pools, methods, opt, k = 5, seed = 42, group = (e) => e.g }) {
  // V0.37: scheme = 'groups' (k grouped folds), 'logo' (one fold per group) or 'examples' (single group: optimistic)
  const gs = test.map((e) => group(e) ?? null), nGroups = new Set(gs.filter((g) => g != null)).size;
  const kk = Math.min(k, test.length), folds = nGroups >= 2 ? groupedFolds(test.map((e) => e.y), gs.map((g, i) => g ?? test[i].key), kk, seed) : stratifiedFolds(test.map((e) => e.y), kk, seed), out = {};
  const scheme = nGroups >= kk && nGroups >= 2 ? 'groups' : nGroups >= 2 ? 'logo' : 'examples';
  // rows = true classes of the test traces; columns add every class the models can predict, so a prediction of a class
  // absent from the test set still counts as an error (column «other»)
  const classes = [...new Set(test.map((e) => e.y))].sort();
  for (const sc of Object.keys(pools)) {
    out[sc] = {};
    for (const m of methods) {
      const cm = classes.map(() => classes.map(() => 0)), other = classes.map(() => 0), none = classes.map(() => 0);
      for (const f of folds) {
        // the test traces and every other trace of their groups (same section or core) are left out of training
        const keys = new Set(f.map((i) => test[i].key)), held = new Set(f.map((i) => gs[i]).filter((g) => g != null));
        const train = pools[sc].filter((e) => !keys.has(e.key) && !(scheme !== 'examples' && held.has(group(e))));
        const trainable = new Set(train.map((e) => e.y)).size >= 2, model = trainable ? new TaxonModel({ ...opt, method: m }).fit(train) : null;
        for (const i of f) {
          const a = classes.indexOf(test[i].y), p = model?.predict(test[i].x, { ignoreNovelty: true }), b = classes.indexOf(p?.y);
          if (b >= 0) cm[a][b]++; else if (p?.y != null) other[a]++; else none[a]++;
        }
      }
      const n = test.length, okc = classes.reduce((s, _, i) => s + cm[i][i], 0);
      const rows = classes.map((_, i) => cm[i].reduce((a, b) => a + b, 0) + other[i] + none[i]);
      const rec = classes.map((_, i) => (rows[i] ? cm[i][i] / rows[i] : null)).filter((v) => v != null);
      out[sc][m] = { accuracy: n ? okc / n : null, balanced: rec.length ? rec.reduce((a, b) => a + b, 0) / rec.length : null, classes, cm, other, none, n, scheme, nGroups, folds: folds.length };
    }
  }
  return out;
}

/**
 * V0.49: metrics of a final test on reserved cores. pairs = [{y: true class, p: predicted class or null}].
 * accuracy = right / all (no prediction counts as wrong); balanced = mean recall over the true classes;
 * cm[a][b] counts true a predicted b ('—' = no prediction).
 */
export function finalTestMetrics(pairs) {
  const classes = [...new Set(pairs.map((q) => q.y))].sort(), cm = {}, rec = [];
  for (const q of pairs) { const p = q.p ?? '—'; (cm[q.y] ||= {})[p] = (cm[q.y][p] || 0) + 1; }
  for (const c of classes) { const row = cm[c] || {}, n = Object.values(row).reduce((a, v) => a + v, 0); rec.push(n ? (row[c] || 0) / n : 0); }
  const n = pairs.length, ok = pairs.filter((q) => q.p === q.y).length;
  return { n, right: ok, accuracy: n ? ok / n : null, balanced: rec.length ? rec.reduce((a, v) => a + v, 0) / rec.length : null, classes, cm, none: pairs.filter((q) => q.p == null).length };
}
