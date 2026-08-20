/**
 * Minimal ZIP reader — enough to read an .xlsx, and nothing more.
 *
 * ─── WHY THIS EXISTS RATHER THAN A DEPENDENCY ───────────────────────────────
 * An .xlsx file is a ZIP archive of XML. The obvious library, SheetJS, is only
 * published to npm as 0.18.5, which carries two unpatched high-severity
 * advisories (CVE-2023-30533 prototype pollution, CVE-2024-22363 ReDoS); the
 * fixes exist only in releases distributed from cdn.sheetjs.com. Shipping a
 * permanently-flagged dependency inside a tool whose job is answering
 * "do you monitor your dependencies for vulnerabilities?" is the wrong trade.
 *
 * Every browser this app supports ships `DecompressionStream('deflate-raw')`
 * natively, so the inflate — the only genuinely hard part — is done by the
 * platform. What is left is reading a well-documented header format.
 *
 * Deliberately narrow: no writing, no encryption, no multi-disk archives, no
 * ZIP64. Anything outside that is reported rather than half-handled.
 * ────────────────────────────────────────────────────────────────────────────
 */

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_EOCD64_LOCATOR = 0x07064b50;

const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

/** A ZIP comment can be 64KB, so the end-of-directory record is within 64KB+22 of the end. */
const MAX_EOCD_SEARCH = 65557;

/** Refuse absurd archives rather than trying to allocate them. */
const MAX_ENTRIES = 5000;
const MAX_ENTRY_BYTES = 200 * 1024 * 1024;

/**
 * Open an archive.
 *
 * Entries are located up front but inflated only on demand — an .xlsx contains
 * styles, themes and a calculation chain we never look at, and a large workbook's
 * unused parts can be bigger than the sheets themselves.
 *
 * @param buffer ArrayBuffer | Uint8Array
 * @returns { names, has, read, readText }
 */
export function openZip(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const eocdOffset = findEocd(bytes, view);
  if (eocdOffset === -1) {
    throw new Error('Not a ZIP archive (no end-of-central-directory record found).');
  }

  // ZIP64 archives put the real values in a separate record. Excel only emits
  // one for enormous workbooks, so report it plainly instead of guessing.
  if (eocdOffset >= 20 && view.getUint32(eocdOffset - 20, true) === SIG_EOCD64_LOCATOR) {
    throw new Error('ZIP64 archives are not supported.');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);

  if (totalEntries > MAX_ENTRIES) {
    throw new Error(`Archive has ${totalEntries} entries, which is more than this reader allows.`);
  }
  if (centralOffset >= bytes.byteLength) {
    throw new Error('Archive central directory is out of bounds — the file is truncated or corrupt.');
  }

  const entries = new Map();
  let cursor = centralOffset;

  for (let i = 0; i < totalEntries; i += 1) {
    if (cursor + 46 > bytes.byteLength) break;
    if (view.getUint32(cursor, true) !== SIG_CENTRAL) break;

    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);

    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = new TextDecoder('utf-8').decode(nameBytes);

    // Bit 0 is the encryption flag. Excel's "protect workbook" uses a different
    // mechanism, but a password-encrypted file lands here.
    const encrypted = (flags & 0x0001) !== 0;

    entries.set(name, {
      name,
      method,
      compressedSize,
      uncompressedSize,
      localOffset,
      encrypted,
    });

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  /** Byte range of an entry's compressed data, read from its local header. */
  function dataRange(entry) {
    const start = entry.localOffset;
    if (start + 30 > bytes.byteLength || view.getUint32(start, true) !== SIG_LOCAL) {
      throw new Error(`Entry "${entry.name}" has a bad local header.`);
    }
    // The local header repeats the name and extra-field lengths, and its extra
    // field can differ in length from the central directory's — so the data
    // offset has to come from here, while the sizes come from the directory
    // (a streamed entry leaves the local sizes zero).
    const nameLength = view.getUint16(start + 26, true);
    const extraLength = view.getUint16(start + 28, true);
    const dataStart = start + 30 + nameLength + extraLength;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > bytes.byteLength) {
      throw new Error(`Entry "${entry.name}" extends past the end of the file.`);
    }
    return [dataStart, dataEnd];
  }

  return {
    /** Every entry name in the archive. */
    get names() {
      return [...entries.keys()];
    },

    has(name) {
      return entries.has(name);
    },

    /** Inflate one entry to bytes. */
    async read(name) {
      const entry = entries.get(name);
      if (!entry) throw new Error(`"${name}" is not in the archive.`);
      if (entry.encrypted) {
        throw new Error('The file is password-protected, so its contents cannot be read.');
      }
      if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
        throw new Error(
          `"${name}" expands to ${Math.round(entry.uncompressedSize / 1048576)} MB, which is larger than this reader allows.`,
        );
      }

      const [start, end] = dataRange(entry);
      const compressed = bytes.subarray(start, end);

      if (entry.method === METHOD_STORE) return compressed.slice();
      if (entry.method !== METHOD_DEFLATE) {
        throw new Error(`"${name}" uses compression method ${entry.method}, which is not supported.`);
      }
      return inflateRaw(compressed);
    },

    /** Inflate one entry and decode it as UTF-8 text. */
    async readText(name) {
      return new TextDecoder('utf-8').decode(await this.read(name));
    },
  };
}

/**
 * Scan backwards for the end-of-central-directory signature.
 *
 * Backwards because the record sits at the end, before an optional comment whose
 * bytes could themselves contain the signature — the last occurrence is the real
 * one.
 */
function findEocd(bytes, view) {
  const limit = Math.max(0, bytes.byteLength - MAX_EOCD_SEARCH);
  for (let offset = bytes.byteLength - 22; offset >= limit; offset -= 1) {
    if (view.getUint32(offset, true) === SIG_EOCD) {
      // Sanity-check the comment length against the remaining bytes, so a
      // coincidental signature inside compressed data is rejected.
      const commentLength = view.getUint16(offset + 20, true);
      if (offset + 22 + commentLength === bytes.byteLength) return offset;
    }
  }
  return -1;
}

/**
 * Raw DEFLATE via the platform.
 *
 * `deflate-raw` (no zlib header) is what ZIP stores. Available in Chrome 80+,
 * Firefox 113+, Safari 16.4+ and Node 18+ — so this same code path is what the
 * unit tests exercise.
 */
async function inflateRaw(compressed) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot decompress ZIP archives (DecompressionStream is unavailable).');
  }
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const inflated = await new Response(stream).arrayBuffer();
  return new Uint8Array(inflated);
}

/** True when the bytes begin with a ZIP local-file signature ("PK\x03\x04"). */
export function looksLikeZip(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}
