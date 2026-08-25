/**
 * Document name handling for the knowledge base.
 *
 * A document's name is not only a label. It is the filename the browser is told
 * to save when someone downloads the file, so a rename is a small piece of
 * untrusted input on a path that ends at the user's filesystem. Everything that
 * makes a filename dangerous or useless is stripped here, in one pure function,
 * rather than at each call site.
 *
 * Kept dependency-free so it can be unit tested in plain Node.
 */

/** Longest name we will store. Comfortably under every filesystem's limit. */
export const MAX_DOC_NAME = 200;

/** Windows reserves these regardless of extension. */
const RESERVED = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

/** `.pdf` from `report.pdf`, or '' when there is no sane extension. */
export function extensionOf(name) {
  const value = String(name || '');
  const dot = value.lastIndexOf('.');
  // No dot, a leading dot (".bashrc" is all name), or a trailing dot.
  if (dot <= 0 || dot === value.length - 1) return '';
  const ext = value.slice(dot);
  // An "extension" with a space in it is almost certainly just prose.
  if (/\s/.test(ext) || ext.length > 12) return '';
  return ext;
}

/**
 * Clean a user-supplied document name.
 *
 * @param input         what the user typed
 * @param previousName  the name being replaced, used to keep the extension
 * @returns the name to store, or null if the input cannot be used
 *
 * Rules, in order:
 *   - path separators and control characters are removed, so a name can never
 *     redirect a download out of the browser's download directory
 *   - whitespace is trimmed and collapsed
 *   - leading dots are dropped, so a rename cannot produce a hidden file
 *   - a Windows reserved device name gets an underscore appended
 *   - if the result has no extension and the old name did, the old one is kept:
 *     dropping ".xlsx" leaves a file the operating system cannot open
 *   - the result is capped at MAX_DOC_NAME with the extension preserved
 */
export function normaliseDocName(input, previousName = '') {
  let value = String(input ?? '');

  // Control characters split into two groups, because they are not all the same
  // kind of problem. Tab, newline, carriage return, form feed and vertical tab
  // arrive from pasting out of a document and mean "space" — collapsing them to
  // one keeps "Disaster\nRecovery" readable as two words. Everything else in the
  // C0/C1 range is removed outright: a NUL in particular can truncate a filename
  // in whatever consumes it downstream, so it must not survive as anything.
  // eslint-disable-next-line no-control-regex
  value = value.replace(/[\t\n\r\f\v]/g, ' ');
  // eslint-disable-next-line no-control-regex
  value = value.replace(/[\x00-\x1f\x7f-\x9f]/g, '');
  // Characters Windows rejects outright, since the file may be saved there.
  value = value.replace(/[/\\:*?"<>|]/g, '');

  // Collapse runs of whitespace — including the tabs and newlines a paste can
  // carry — into single spaces, then trim.
  value = value.replace(/\s+/g, ' ').trim();

  // ".", "..", ".hidden" — a leading dot is never wanted here.
  value = value.replace(/^\.+/, '').trim();

  if (!value) return null;

  const ext = extensionOf(value);
  const stem = ext ? value.slice(0, -ext.length) : value;

  if (!stem.trim()) return null;

  // Reserved device names are rejected by Windows with or without an extension.
  const safeStem = RESERVED.has(stem.trim().toLowerCase()) ? `${stem.trim()}_` : stem;

  // Keep the previous extension when the new name lost it.
  const finalExt = ext || extensionOf(previousName);

  let result = `${safeStem}${finalExt}`;
  if (result.length > MAX_DOC_NAME) {
    const room = Math.max(1, MAX_DOC_NAME - finalExt.length);
    result = `${safeStem.slice(0, room).trim()}${finalExt}`;
  }

  return result.trim() || null;
}
