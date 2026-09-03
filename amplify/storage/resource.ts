import { defineStorage } from '@aws-amplify/backend';

/**
 * S3 bucket for uploaded files: policy documents in the knowledge base,
 * attachments on the questionnaire approval step, and profile avatars.
 *
 * Two prefixes, because auth is deferred:
 *
 *   user-files/{entity_id}/*  Signed-in users only. `{entity_id}` is replaced
 *                             with the caller's Cognito identity ID and IAM
 *                             enforces it — nobody can read another user's
 *                             prefix, full stop.
 *
 *   guest-files/*             Anonymous visitors. The client still writes to
 *                             guest-files/<identityId>/… so the UI stays
 *                             scoped per browser, but IAM cannot enforce that
 *                             for guests: any guest could read any guest
 *                             object if they guessed the key. Do not put real
 *                             customer documents here before auth is on.
 *
 * src/lib/files.js picks the prefix automatically based on whether the caller
 * is signed in, so once auth lands every new upload lands in the enforced
 * prefix with no client changes.
 */
export const storage = defineStorage({
  name: 'serotoninFiles',
  access: (allow) => ({
    'user-files/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete']),
    ],
    /**
     * Shared library mode (VITE_SHARED_LIBRARY=1). One prefix, readable and
     * writable by everyone who can reach the app — which is the point, and the
     * risk. See src/lib/libraryMode.js before enabling it.
     */
    'shared-files/*': [
      allow.guest().to(['read', 'write', 'delete']),
      allow.authenticated().to(['read', 'write', 'delete']),
    ],
    'guest-files/*': [
      allow.guest().to(['read', 'write', 'delete']),
      allow.authenticated().to(['read', 'write', 'delete']),
    ],
  }),
});
