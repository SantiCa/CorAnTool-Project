// CorAnTool — minimal ZIP writer and reader (V0.8), no external libraries.
// Used for the shareable project package (.corantool): project.json + images/… at full resolution.
// Writer: method 0 (stored, images are already compressed). Reader: stored and deflate (DecompressionStream).
// Works on Blobs, so large images are not copied into one big string. Limit: 4 GB per package (no ZIP64).

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(bytes, crc = 0) {
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}
const enc = new TextEncoder();

/** files: [{ name, data: Blob | Uint8Array | string }] → Blob (application/zip). */
export async function zipFiles(files) {
  const parts = [], central = []; let offset = 0;
  for (const f of files) {
    const data = typeof f.data === 'string' ? new Blob([enc.encode(f.data)]) : f.data instanceof Blob ? f.data : new Blob([f.data]);
    const bytes = new Uint8Array(await data.arrayBuffer()), crc = crc32(bytes), name = enc.encode(f.name), size = bytes.length;
    if (offset + size > 0xffffffff) throw new Error('ZIP > 4 GB');
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true); h.setUint16(26, name.length, true);
    parts.push(h.buffer, name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    central.push(c.buffer, name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((a, p) => a + (p.byteLength ?? p.length), 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, e.buffer], { type: 'application/zip' });
}

/** Read the table of contents of a ZIP Blob: Map name → { get(): Promise<Blob> }. */
export async function unzipBlob(blob) {
  const tailLen = Math.min(blob.size, 65557), tail = new DataView(await blob.slice(blob.size - tailLen).arrayBuffer());
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a ZIP file');
  const n = tail.getUint16(eocd + 10, true), cdSize = tail.getUint32(eocd + 12, true), cdOff = tail.getUint32(eocd + 16, true);
  const cd = new DataView(await blob.slice(cdOff, cdOff + cdSize).arrayBuffer()), dec = new TextDecoder(), out = new Map();
  for (let i = 0, p = 0; i < n; i++) {
    if (cd.getUint32(p, true) !== 0x02014b50) throw new Error('bad ZIP directory');
    const method = cd.getUint16(p + 10, true), csize = cd.getUint32(p + 20, true), nl = cd.getUint16(p + 28, true), xl = cd.getUint16(p + 30, true), cl = cd.getUint16(p + 32, true), lo = cd.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nl));
    out.set(name, {
      async get() {
        const lh = new DataView(await blob.slice(lo, lo + 30).arrayBuffer()), start = lo + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
        const raw = blob.slice(start, start + csize);
        if (method === 0) return raw;
        if (method === 8) return new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
        throw new Error('unsupported ZIP compression');
      },
    });
    p += 46 + nl + xl + cl;
  }
  return out;
}
