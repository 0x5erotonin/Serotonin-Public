/**
 * Build the ZIP fixture used by the bulk-import test.
 *
 * Written by hand with stored (uncompressed) entries rather than shelling out to
 * `zip`, so the fixture is reproducible on any machine and the test does not
 * depend on a system tool being installed. `src/lib/unzip.js` supports method 0
 * (store) and method 8 (deflate); store is enough to exercise the archive path
 * and keeps this generator small enough to read.
 *
 *   node tests/fixtures/make-zip.mjs
 */

import { writeFileSync } from 'node:fs';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** @param entries {Array<{name: string, text: string}>} */
function buildZip(entries) {
  const encoder = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = encoder.encode(entry.text);
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);   // local file header signature
    lv.setUint16(4, 20, true);           // version needed
    lv.setUint16(6, 0, true);            // flags
    lv.setUint16(8, 0, true);            // method: store
    lv.setUint16(10, 0, true);           // mod time
    lv.setUint16(12, 0, true);           // mod date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true); // compressed size
    lv.setUint32(22, data.length, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);           // extra length
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);   // central directory signature
    cv.setUint16(4, 20, true);           // version made by
    cv.setUint16(6, 20, true);           // version needed
    cv.setUint16(8, 0, true);            // flags
    cv.setUint16(10, 0, true);           // method: store
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);      // offset of local header
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);   // entries on this disk
  ev.setUint16(10, entries.length, true);  // total entries
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);          // central directory offset

  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of [...locals, ...centrals, eocd]) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

// Names chosen to exercise category guessing, nested paths, and the entries the
// importer is expected to skip.
const zip = buildZip([
  {
    name: 'policies/access-control-policy.txt',
    text: [
      'Access Control Policy',
      '',
      'Multi-factor authentication is required for all administrative access to production systems. Enforcement is through the corporate identity provider using hardware security keys.',
    ].join('\n'),
  },
  {
    name: 'policies/disaster-recovery-plan.txt',
    text: [
      'Disaster Recovery Plan',
      '',
      'The disaster recovery plan is exercised twice per year, with one tabletop walkthrough and one full failover test to the secondary region.',
    ].join('\n'),
  },
  {
    name: 'policies/soc2-type-ii-2026.txt',
    text: [
      'SOC 2 Type II Report 2026',
      '',
      'All customer data is encrypted at rest using AES-256 and in transit using TLS 1.3. No exceptions were noted during the audit period.',
    ].join('\n'),
  },
  // Should be skipped: not a document type the extractor reads.
  { name: 'policies/logo.png', text: 'not really a png' },
  // Should be skipped: macOS metadata.
  { name: '__MACOSX/._access-control-policy.txt', text: 'resource fork' },
  // Should be skipped: a dotfile.
  { name: 'policies/.DS_Store', text: 'junk' },
]);

const target = new URL('./policies.zip', import.meta.url);
writeFileSync(target, zip);
console.log(`wrote ${target.pathname} (${zip.length} bytes, 6 entries, 3 importable)`);
