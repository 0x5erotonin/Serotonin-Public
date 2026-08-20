import { defineBackend } from '@aws-amplify/backend';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { embedText } from './functions/embed-text/resource';

/**
 * Serotonin — AWS Amplify Gen 2 backend
 *
 * Provisions on `git push` (Amplify Hosting runs `npx ampx pipeline-deploy`,
 * see amplify.yml):
 *
 *   auth       → Cognito user pool + identity pool (guest access ON for now)
 *   data       → AppSync GraphQL API backed by DynamoDB tables
 *   storage    → S3 bucket for uploaded policy documents and attachments
 *   embedText  → Lambda that turns text into Bedrock embeddings, exposed as the
 *                `embedTexts` mutation and used by the auto-review matcher
 *
 * Authentication is intentionally deferred — see amplify/data/resource.ts for
 * the one-line change that locks every record to its owner once sign-in is on.
 */
const backend = defineBackend({
  auth,
  data,
  storage,
  embedText,
});

/**
 * Let the embedding function call Bedrock.
 *
 * There is no `defineFunction` option for this, so it goes through the CDK
 * escape hatch. Scoped to the one Titan embedding model rather than `bedrock:*`
 * on `*`, so a bug here cannot invoke an expensive text-generation model.
 *
 * Note the two ARN forms: the first covers the on-demand foundation model in
 * this region, the second covers Bedrock's cross-region inference profiles,
 * which some regions route through. Drop the second if you want to pin
 * inference to a single region.
 *
 * This grant is necessary but not sufficient — model access also has to be
 * enabled for the account: Console → Bedrock → Model access.
 */
backend.embedText.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['bedrock:InvokeModel'],
    resources: [
      'arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v2:0',
      'arn:aws:bedrock:*:*:inference-profile/*amazon.titan-embed-text-v2*',
    ],
  }),
);

export default backend;
