/**
 * Private library, or shared library.
 *
 * By default every browser is its own world: records are scoped to the caller's
 * Cognito identity and files land under a per-identity prefix, so two people
 * opening the same URL see two empty libraries. That is the right default and it
 * is why nothing is shared today.
 *
 * Shared mode swaps both for a single fixed key, so everyone who can open the
 * URL sees and edits one library.
 *
 * ─── READ THIS BEFORE TURNING IT ON ─────────────────────────────────────────
 * Shared mode is not "shared with my team". It is "shared with anyone who can
 * reach the URL", because until Cognito sign-in is enforced there is nothing to
 * distinguish a colleague from a stranger. A deployed Amplify URL is not a
 * secret: it appears in browser history, in referrer headers, and in anything
 * that crawls a link.
 *
 * Fine for a demo with invented data. Not fine for a real SOC 2 report, a real
 * pen test report, or a completed customer questionnaire. For an actual team
 * library, turn auth on first — AMPLIFY_SETUP.md, "Another user sees none of my
 * work", option 3.
 *
 * ─── HOW TO TURN IT ON ──────────────────────────────────────────────────────
 * Set the environment variable in the Amplify console (App settings →
 * Environment variables) and redeploy — no code change, and nothing to install:
 *
 *     VITE_SHARED_LIBRARY = 1
 *
 * Vite inlines it at build time, so the mode is fixed for a given deploy and
 * cannot be flipped by a visitor.
 *
 * Kept dependency-free and env-injectable so the parsing is unit testable.
 */

/** The owner key every record carries in shared mode. */
export const SHARED_OWNER_KEY = 'shared-library';

/** The S3 prefix every upload uses in shared mode. */
export const SHARED_FILE_PREFIX = 'shared-files/';

/** Set once a re-key has run, so it happens at most once per device. */
export const SHARED_REKEY_KEY = 'serotonin.v2.rekeyedToShared';

const TRUTHY = new Set(['1', 'true', 'yes', 'on', 'shared']);

/**
 * Decide the library mode from an environment object.
 *
 * Fails closed: anything that is not explicitly one of the accepted truthy
 * values leaves the library private. A typo in a console setting must not
 * silently publish a compliance library, so 'ture', 'enabled' and '2' are all
 * "no" rather than "probably yes".
 *
 * @param env  usually `import.meta.env`
 * @returns { shared, raw, recognised }
 */
export function readLibraryMode(env = {}) {
  const raw = env?.VITE_SHARED_LIBRARY;
  const normalised = String(raw ?? '').trim().toLowerCase();
  const shared = TRUTHY.has(normalised);
  return {
    shared,
    raw: raw === undefined || raw === null ? '' : String(raw),
    // True when the value was understood either way — so an unrecognised value
    // can be reported rather than silently treated as off.
    recognised: normalised === '' || shared || ['0', 'false', 'no', 'off'].includes(normalised),
  };
}
