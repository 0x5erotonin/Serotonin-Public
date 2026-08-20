import { defineFunction } from '@aws-amplify/backend';

/**
 * Text embedding function — the semantic half of the hybrid matcher.
 *
 * Deliberately a stateless embedding proxy rather than a full search service:
 * it takes strings, returns vectors, and touches no database. That means
 *
 *   • Bedrock credentials never reach the browser.
 *   • No IAM grants between this function and the data tables.
 *   • The client keeps its vectors alongside the text it already needs for
 *     lexical scoring and passage citation, so a match run costs exactly one
 *     call for the questions being matched — not one per candidate.
 *
 * If this function is not deployed, or Bedrock model access is not enabled in
 * the region, the client degrades to lexical-only matching. See
 * src/lib/embeddings.js.
 *
 * REQUIRES: Bedrock model access for Amazon Titan Text Embeddings V2 in the
 * deployment region. Console → Bedrock → Model access → enable
 * `amazon.titan-embed-text-v2:0`. Without it every call returns 403 and the
 * matcher silently falls back to lexical.
 */
export const embedText = defineFunction({
  name: 'embed-text',
  entry: './handler.ts',
  // Titan embeds one string per call, so a 50-question run is 50 calls at
  // limited concurrency. 60s leaves comfortable headroom.
  timeoutSeconds: 60,
  memoryMB: 512,
  environment: {
    EMBEDDING_MODEL_ID: 'amazon.titan-embed-text-v2:0',
    // 256 dimensions rather than the 1024 default: the vectors are stored in
    // DynamoDB as JSON and shipped to the browser for cosine scoring, so size
    // matters. Titan V2 is trained for 256/512/1024 and 256 costs very little
    // retrieval quality at this corpus size.
    EMBEDDING_DIMENSIONS: '256',
  },
});
