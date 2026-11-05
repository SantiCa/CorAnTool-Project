import test from 'node:test';
import assert from 'node:assert/strict';
import { zipFiles, unzipBlob, crc32 } from '../../app/js/zip.js';

test('V0.8: zip round trip (text and binary entries) and CRC-32', async () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const bin = new Uint8Array(3000).map((_, i) => (i * 7) & 255);
  const z = await zipFiles([{ name: 'project.json', data: '{"a":1}' }, { name: 'images/x ñ.jpg', data: new Blob([bin]) }]);
  const m = await unzipBlob(z);
  assert.equal(await (await m.get('project.json').get()).text(), '{"a":1}');
  assert.deepEqual(new Uint8Array(await (await m.get('images/x ñ.jpg').get()).arrayBuffer()), bin);
});
