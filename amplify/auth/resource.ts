import { defineAuth } from '@aws-amplify/backend';

/**
 * Cognito auth resource.
 *
 * This exists because Amplify Data and Storage both need an identity pool to
 * hand out AWS credentials — even for anonymous visitors. The user pool is
 * provisioned and ready, but nothing in the UI forces a sign-in yet.
 *
 * Guest (unauthenticated) identities are enabled by default in Gen 2, which is
 * what lets the app read and write data before auth is wired up. Every guest
 * browser gets a durable Cognito identity ID, cached in local storage by the
 * Amplify SDK — that ID is what scopes their records and their S3 prefix.
 *
 * WHEN YOU COME BACK TO AUTH:
 *   1. Add the providers you want below (`externalProviders` for Google SSO).
 *   2. Flip the authorization rules in amplify/data/resource.ts to allow.owner().
 *   3. Set `allowUnauthenticatedIdentities: false` via the CDK escape hatch in
 *      backend.ts to shut the guest door.
 *   4. Replace the Supabase SignInScreen in src/Serotonin.jsx with Cognito
 *      signIn/signUp from `aws-amplify/auth`.
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
    // externalProviders: {
    //   google: {
    //     clientId: secret('GOOGLE_CLIENT_ID'),
    //     clientSecret: secret('GOOGLE_CLIENT_SECRET'),
    //     scopes: ['email', 'profile'],
    //   },
    //   callbackUrls: ['http://localhost:5173/', 'https://your-app.amplifyapp.com/'],
    //   logoutUrls:   ['http://localhost:5173/', 'https://your-app.amplifyapp.com/'],
    // },
  },
  userAttributes: {
    fullname: { required: false, mutable: true },
    'custom:department': { dataType: 'String', mutable: true, maxLen: 128 },
    'custom:jobTitle': { dataType: 'String', mutable: true, maxLen: 128 },
  },
});
