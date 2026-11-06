// CorAnTool web — project library in the browser (IndexedDB). Each project is a "folder" holding its
// images, depths, age model, labels and external records. Data stay on this computer and browser.

const DB_NAME = 'ichantool', DB_VERSION = 5;   // V0.44: store 'secs' (one record per section)
let dbPromise = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('data')) db.createObjectStore('data', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('prefs')) db.createObjectStore('prefs', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'key' }); // V0.1: original image files, written once
      if (!db.objectStoreNames.contains('lite')) db.createObjectStore('lite', { keyPath: 'id' }); // numeric data only, for the all-projects view
      if (!db.objectStoreNames.contains('secs')) db.createObjectStore('secs', { keyPath: 'key' }); // V0.44: sections of a project, saved one by one
    };
    req.onsuccess = () => { const d = req.result; d.onversionchange = () => { d.close(); dbPromise = null; }; resolve(d); };
    req.onblocked = () => console.warn('IndexedDB upgrade blocked by another tab');
    req.onerror = () => reject(req.error);
  });
}
const db = () => (dbPromise ||= openDB());

function run(stores, mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const tx = d.transaction(stores, mode);
    const req = fn(tx);
    tx.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export async function storageAvailable() {
  try { await db(); return true; } catch { return false; }
}
export const listProjects = () => run(['meta'], 'readonly', (tx) => tx.objectStore('meta').getAll());
/*
 * V0.44: saving by sections. The project record keeps a stub per section ({$sec, id, name, file}) and each section
 * lives in 'secs' under "<project id>|<section id>". A section is written only when it changed since it was last
 * written or read in this session (same masks and same remaining fields), or when its record is missing.
 * getProject() puts the sections back, so callers always receive the complete project. Records written before
 * V0.44 (sections inside the project) are read as they are.
 */
const lastSec = new Map();
const secSig = (q) => ({ lab: q.labels, ex: q.exclude, rest: JSON.stringify({ ...q, labels: 0, exclude: 0 }) });
const arrEq = (a, b) => { if (a === b) return true; if (!a || !b || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
const sameSec = (p, c) => p.rest === c.rest && arrEq(p.lab, c.lab) && arrEq(p.ex, c.ex);
const secLists = (d) => (d?.cores ? d.cores.map((c) => c.sections || []) : d?.sections ? [d.sections] : []);
export const getProject = (id) => run(['data', 'secs'], 'readonly', (tx) => {
  const out = { result: null }, r = tx.objectStore('data').get(id);
  r.onsuccess = () => {
    const d = r.result?.data || null; out.result = d; if (!d) return;
    const st = tx.objectStore('secs');
    for (const list of secLists(d)) list.forEach((q, i) => {
      if (!q?.$sec) return;
      const g = st.get(q.$sec);
      g.onsuccess = () => { if (g.result) { list[i] = g.result.q; lastSec.set(q.$sec, secSig(g.result.q)); } else list[i] = { ...q, $missing: true }; };
    });
  };
  return out;
});
export function putProject(meta, data) {
  const id = meta.id, writes = [], checks = [], keep = new Set(), stub = { ...data };
  const conv = (list, ci) => (list || []).map((q, i) => {
    if (!q || q.$sec) { if (q?.$sec) keep.add(q.$sec); return q; }
    const key = `${id}|${q.id ?? `${ci}:${i}`}`, sig = secSig(q), prev = lastSec.get(key); keep.add(key);
    (prev && sameSec(prev, sig) ? checks : writes).push({ key, q, sig });
    return { $sec: key, id: q.id, name: q.name, file: q.file };
  });
  if (data.cores) stub.cores = data.cores.map((c, ci) => ({ ...c, sections: conv(c.sections, ci) }));
  else if (data.sections) stub.sections = conv(data.sections, 0);
  return run(['meta', 'data', 'secs'], 'readwrite', (tx) => {
    const st = tx.objectStore('secs');
    tx.objectStore('meta').put(meta);
    tx.objectStore('data').put({ id, data: stub });
    for (const w of writes) st.put({ key: w.key, q: w.q });
    for (const c of checks) { const k = st.getKey(c.key); k.onsuccess = () => { if (k.result === undefined) st.put({ key: c.key, q: c.q }); }; }   // never trust the cache alone
    const old = st.getAllKeys(IDBKeyRange.bound(id + '|', id + '|\uffff'));
    old.onsuccess = () => { for (const k of old.result) if (!keep.has(k)) st.delete(k); };
  }).then(() => { for (const w of [...writes, ...checks]) lastSec.set(w.key, w.sig); return { written: writes.length, kept: checks.length }; });
}
export const putMeta = (meta) => run(['meta'], 'readwrite', (tx) => tx.objectStore('meta').put(meta));
/** Image keys referenced by a stored project (format v4: file.key). */
export function imageKeys(data) {
  const out = [];
  for (const c of data?.cores || [{ sections: data?.sections }]) for (const q of c.sections || []) if (q.file?.key) out.push(q.file.key);
  return out;
}
export const deleteProject = (id) => run(['meta', 'data', 'lite', 'images', 'secs'], 'readwrite', (tx) => {
  const r = tx.objectStore('data').get(id);
  r.onsuccess = () => { for (const k of imageKeys(r.result?.data)) tx.objectStore('images').delete(k); tx.objectStore('data').delete(id); };
  tx.objectStore('meta').delete(id);
  tx.objectStore('lite').delete(id);
  tx.objectStore('secs').delete(IDBKeyRange.bound(id + '|', id + '|\uffff'));
  for (const k of [...lastSec.keys()]) if (k.startsWith(id + '|')) lastSec.delete(k);
});
/** V0.1: original image files live in their own store (on disk) and are read only when a section needs its pixels. */
// V0.2: stored as bytes (ArrayBuffer), not as Blob: Blob values in IndexedDB fail in the desktop program (app:// origin).
export const putImage = async (key, blob) => { const bytes = await blob.arrayBuffer(); return run(['images'], 'readwrite', (tx) => tx.objectStore('images').put({ key, bytes, type: blob.type, t: Date.now() })); };
export const getImage = (key) => run(['images'], 'readonly', (tx) => tx.objectStore('images').get(key)).then((r) => (r ? r.blob || new Blob([r.bytes], { type: r.type || 'image/jpeg' }) : null));
/** Delete images that no project references (sections removed), if older than one hour. */
export async function gcImages() {
  const [keys, datas] = await Promise.all([run(['images'], 'readonly', (tx) => tx.objectStore('images').getAllKeys()), run(['data'], 'readonly', (tx) => tx.objectStore('data').getAll())]);
  const used = new Set(datas.flatMap((d) => imageKeys(d.data)));
  const stale = keys.filter((k) => !used.has(k));
  if (!stale.length) return 0;
  const old = Date.now() - 3600e3;
  return run(['images'], 'readwrite', (tx) => { const st = tx.objectStore('images'); for (const k of stale) { const g = st.get(k); g.onsuccess = () => { if ((g.result?.t || 0) < old) st.delete(k); }; } }).then(() => stale.length);
}
export const putLite = (id, lite) => run(['lite'], 'readwrite', (tx) => tx.objectStore('lite').put({ ...lite, id }));
export const listLite = () => run(['lite'], 'readonly', (tx) => tx.objectStore('lite').getAll());
export const getMeta = (id) => run(['meta'], 'readonly', (tx) => tx.objectStore('meta').get(id));

/** Preferences shared by all projects (user presets, backup folder handle, last backup time). */
export const getPref = (key) => run(['prefs'], 'readonly', (tx) => tx.objectStore('prefs').get(key)).then((r) => r?.value);
export const setPref = (key, value) => run(['prefs'], 'readwrite', (tx) => tx.objectStore('prefs').put({ key, value }));
