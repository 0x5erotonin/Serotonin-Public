import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

/**
 * Turns strings into vectors with Amazon Titan Text Embeddings V2.
 *
 * Called by the `embedTexts` mutation in amplify/data/resource.ts. Returns
 * `{ model, dimensions, vectors }` where `vectors[i]` corresponds to
 * `texts[i]`, or `null` in that slot if the text was empty or its call failed —
 * a partial result is far more useful to the matcher than an error, since it
 * can fall back to lexical scoring for just the questions that missed.
 */

const MODEL_ID = process.env.EMBEDDING_MODEL_ID || 'amazon.titan-embed-text-v2:0';
const DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS || 256);

/** Guard rails: one request cannot ask for unbounded Bedrock spend. */
const MAX_TEXTS = 120;
const MAX_CHARS = 8000;
const CONCURRENCY = 5;

/** Trim vector precision — 5 decimals is well inside cosine noise and ~40% smaller as JSON. */
const ROUND = 1e5;

const client = new BedrockRuntimeClient({});

type Handler = (event: {
  arguments: { texts?: (string | null)[]; dimensions?: number | null };
}) => Promise<{
  model: string;
  dimensions: number;
  vectors: (number[] | null)[];
  truncated: boolean;
  errors: string[];
}>;

export const handler: Handler = async (event) => {
  const incoming = Array.isArray(event?.arguments?.texts) ? event.arguments.texts : [];
  const truncated = incoming.length > MAX_TEXTS;
  const texts = incoming.slice(0, MAX_TEXTS);
  const dimensions = normaliseDimensions(event?.arguments?.dimensions);
  const vectors: (number[] | null)[] = new Array(texts.length).fill(null);
  const errors: string[] = [];

  // Bounded concurrency: a worker pool over shared indices, so one slow call
  // does not stall a whole batch the way chunked Promise.all would.
  let cursor = 0;
  const worker = async () => {
    while (cursor < texts.length) {
      const index = cursor;
      cursor += 1;
      const text = String(texts[index] ?? '').trim().slice(0, MAX_CHARS);
      if (!text) continue;
      try {
        vectors[index] = await embed(text, dimensions);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // One message per distinct failure, not one per text — a missing model
        // grant would otherwise return 120 copies of the same line.
        if (!errors.includes(message)) errors.push(message);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, texts.length || 1) }, worker),
  );

  return { model: MODEL_ID, dimensions, vectors, truncated, errors };
};

async function embed(text: string, dimensions: number): Promise<number[]> {
  const response = await client.send(
    new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({ inputText: text, dimensions, normalize: true }),
    }),
  );

  const payload = JSON.parse(new TextDecoder().decode(response.body));
  const embedding = payload?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error('Bedrock returned no embedding array');
  }
  return embedding.map((value: number) => Math.round(value * ROUND) / ROUND);
}

/** Titan V2 is trained for these three output sizes only. */
function normaliseDimensions(requested?: number | null): number {
  const allowed = [256, 512, 1024];
  const value = Number(requested ?? DIMENSIONS);
  return allowed.includes(value) ? value : 256;
}
