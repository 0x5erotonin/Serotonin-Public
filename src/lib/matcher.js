/**
 * Auto-review: decide, for each extracted question, whether the knowledge base
 * can already answer it.
 *
 * ─── SCORING ────────────────────────────────────────────────────────────────
 * Every candidate gets two independent scores in 0..1:
 *
 *   lexical   BM25 + term coverage + phrase bonus  (src/lib/textIndex.js)
 *   semantic  cosine similarity of Titan embeddings (src/lib/embeddings.js)
 *
 * Combined as `max(lexical, semantic) + 0.05 · min(lexical, semantic)`.
 *
 * Taking the max rather than a blend means either signal alone can carry a
 * match: lexical catches exact control language and acronyms that embeddings
 * blur together, semantic catches paraphrases that share no vocabulary. The
 * small agreement bonus breaks ties in favour of candidates both methods like,
 * without letting one weak signal drag down a strong one. When embeddings are
 * unavailable the formula degrades to plain lexical with no special-casing.
 *
 * ─── CLASSIFICATION ────────────────────────────────────────────────────────
 * Past answers and document passages are treated very differently on purpose:
 *
 *   past answer, score ≥ 0.72   auto-filled — you wrote this answer before
 *   past answer, score ≥ 0.45   suggested, not filled — probably the same
 *                               control, but check
 *   document,    score ≥ 0.40   suggested with a citation, never auto-filled
 *   otherwise                   needs a manual answer
 *
 * A document passage is never written into the answer box. A policy paragraph
 * is evidence that an answer *can* be written, not the answer itself, and in GRC
 * the cost of shipping an unread compliance claim to a customer is a great deal
 * higher than the cost of a click.
 */

import { buildIndex, search, cosine, displayTerms, tokenize } from './textIndex.js';

/**
 * Default embedder: loaded on demand so a lexical-only run never pulls in the
 * Amplify data client, and so this module stays importable outside a bundler
 * (which is what lets tests/matching.spec.mjs run in plain Node).
 */
async function defaultEmbed(texts) {
  const { embedTexts } = await import('./embeddings.js');
  return embedTexts(texts);
}

export const THRESHOLDS = {
  QA_AUTOFILL: 0.72,
  QA_SUGGEST: 0.45,
  DOC_SUGGEST: 0.40,
};

/** Weight of the agreement bonus when both signals fire. */
const AGREEMENT_BONUS = 0.05;

/**
 * @param questions  [{ text, ... }] from questionExtract
 * @param options    { chunks, onProgress, thresholds, embed }
 *   chunks     KbIndexChunk rows: { id, sourceType, sourceId, sourceName,
 *              category, question, text, page, embedding }
 *   onProgress (stage, detail) => void
 *   embed      override the embedder; used by tests to run either half in
 *              isolation without a network or a bundler
 * @returns { questions: [...reviewed], summary }
 */
export async function autoReview(questions, options = {}) {
  const {
    chunks = [],
    onProgress = () => {},
    thresholds = THRESHOLDS,
    embed = defaultEmbed,
  } = options;
  const list = (questions || []).filter((q) => q?.text?.trim());

  if (list.length === 0) {
    return { questions: [], summary: emptySummary() };
  }

  // No knowledge base yet — everything needs a manual answer, and the reason
  // should say so rather than implying we looked and found nothing.
  if (chunks.length === 0) {
    onProgress('done', 'Knowledge base is empty');
    return {
      questions: list.map((q, index) => needsInput(q, index, 'Knowledge base is empty', 'Import policy documents or complete a questionnaire to start building answer history.')),
      summary: { ...emptySummary(), total: list.length, needsInput: list.length, indexedChunks: 0 },
    };
  }

  /* ── Lexical index ──────────────────────────────────────────────────────── */
  onProgress('indexing', `Indexing ${chunks.length} knowledge base passage${chunks.length !== 1 ? 's' : ''}`);
  // A past Q&A pair is matched on its *question*; a document chunk on its text.
  const index = buildIndex(
    chunks.map((chunk) => ({
      id: chunk.id,
      text: chunk.sourceType === 'qa' ? `${chunk.question || ''} ${chunk.text || ''}` : chunk.text || '',
    })),
  );
  const byId = new Map(chunks.map((chunk) => [String(chunk.id), chunk]));

  /* ── Semantic vectors ───────────────────────────────────────────────────── */
  onProgress('embedding', `Embedding ${list.length} question${list.length !== 1 ? 's' : ''}`);
  // A failure here must degrade to lexical-only, not take the run down: losing
  // paraphrase matching is a much better outcome than losing auto-review.
  let embedded = { vectors: [], available: false, reason: null };
  try {
    embedded = (await embed(list.map((q) => q.text))) || embedded;
  } catch (err) {
    console.warn('[serotonin] Embedding failed — matching with keywords only.', err);
    embedded = {
      vectors: [],
      available: false,
      reason: `Semantic matching unavailable: ${err?.message || err}`,
    };
  }
  const semanticOn = !!embedded.available && Array.isArray(embedded.vectors);

  // Only vectors of the same width as the question vectors are comparable.
  // Cosine returns 0 for a length mismatch, which is indistinguishable from "not
  // similar" — so a change to EMBEDDING_DIMENSIONS would silently switch the
  // semantic half off while still reporting it as on. Count the mismatches
  // instead and surface them.
  const questionDims = embedded.vectors?.find(Array.isArray)?.length ?? 0;
  const chunkVectors = new Map();
  let staleVectors = 0;

  if (semanticOn) {
    for (const chunk of chunks) {
      const vector = parseEmbedding(chunk.embedding);
      if (!vector) continue;
      if (questionDims > 0 && vector.length !== questionDims) {
        staleVectors += 1;
        continue;
      }
      chunkVectors.set(String(chunk.id), vector);
    }
  }

  /* ── Score ──────────────────────────────────────────────────────────────── */
  onProgress('matching', `Matching against ${chunks.length} passage${chunks.length !== 1 ? 's' : ''}`);
  const reviewed = list.map((question, position) => {
    const questionVector = embedded.vectors?.[position] ?? null;
    const candidates = scoreCandidates({
      question,
      questionVector: semanticOn ? questionVector : null,
      index,
      byId,
      chunkVectors,
    });

    const bestQa = candidates.find((c) => c.chunk.sourceType === 'qa') || null;
    const bestDoc = candidates.find((c) => c.chunk.sourceType === 'document') || null;

    const classified = classify({ question, position, bestQa, bestDoc, thresholds, semanticOn });
    // Everything else that could answer this question, one entry per source, so
    // the reviewer can see what was not chosen and pick a different document.
    return { ...classified, alternatives: alternativesFrom(candidates, thresholds) };
  });

  const summary = summarise(reviewed, {
    indexedChunks: chunks.length,
    semanticOn,
    semanticReason:
      embedded.reason ||
      (staleVectors > 0
        ? `${staleVectors} passage${staleVectors !== 1 ? 's were' : ' was'} indexed at a different embedding size and could only be matched by keyword — re-index the knowledge base to include them.`
        : null),
    staleVectors,
    semanticChunks: chunkVectors.size,
  });
  onProgress('done', `${summary.autoFilled} auto-filled, ${summary.suggested} suggested, ${summary.needsInput} manual`);
  return { questions: reviewed, summary };
}

/* ── Candidate scoring ────────────────────────────────────────────────────── */

function scoreCandidates({ question, questionVector, index, byId, chunkVectors }) {
  const lexicalHits = search(index, question.text, { limit: 25 });
  const lexicalById = new Map(lexicalHits.map((hit) => [String(hit.id), hit]));

  // Union of the two candidate sets: a paraphrase can score zero lexically and
  // still be the right passage, so semantic-only candidates must be considered.
  const candidateIds = new Set(lexicalById.keys());
  if (questionVector) {
    for (const id of chunkVectors.keys()) candidateIds.add(id);
  }

  const scored = [];
  for (const id of candidateIds) {
    const chunk = byId.get(id);
    if (!chunk) continue;

    const lexical = lexicalById.get(id);
    const lexicalScore = lexical?.score ?? 0;

    let semanticScore = 0;
    if (questionVector) {
      const chunkVector = chunkVectors.get(id);
      if (chunkVector) {
        // Cosine on unit vectors is -1..1; only positive similarity is meaningful.
        semanticScore = Math.max(0, cosine(questionVector, chunkVector));
      }
    }

    const high = Math.max(lexicalScore, semanticScore);
    const low = Math.min(lexicalScore, semanticScore);
    const score = Math.min(1, high + AGREEMENT_BONUS * low);
    // `> 0` rather than `!(score <= 0)`: a non-finite score must be dropped, not
    // kept, or it breaks the sort comparator and every threshold test after it.
    if (!(score > 0)) continue;

    scored.push({
      chunk,
      score,
      lexicalScore,
      semanticScore,
      matchedOn: lexical?.matchedOn ?? [],
      method: methodLabel(lexicalScore, semanticScore),
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Bounds on the alternatives list. The floor is well below the suggest
 * thresholds on purpose — an alternative is offered to a human who is already
 * looking, not written into an answer box, so the bar is "might be relevant"
 * rather than "confident enough to reuse".
 */
const ALTERNATIVE_FLOOR = 0.18;
const ALTERNATIVE_LIMIT = 6;

function methodLabel(lexicalScore, semanticScore) {
  const lexicalStrong = lexicalScore >= 0.35;
  const semanticStrong = semanticScore >= 0.6;
  if (lexicalStrong && semanticStrong) return 'keyword + semantic';
  if (semanticStrong && semanticScore > lexicalScore) return 'semantic';
  return 'keyword';
}

/**
 * Read a stored embedding, rejecting anything that is not a usable vector.
 *
 * Validated here rather than trusted: these come back from DynamoDB or a
 * localStorage mirror, either of which can hold a truncated or hand-edited
 * value, and a single bad entry used to poison the whole run.
 */
function parseEmbedding(value) {
  let candidate = value;
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(candidate) || candidate.length === 0) return null;
  for (const entry of candidate) {
    if (!Number.isFinite(entry)) return null;
  }
  return candidate;
}

/* ── Classification ──────────────────────────────────────────────────────── */

function classify({ question, position, bestQa, bestDoc, thresholds, semanticOn }) {
  const base = {
    id: position + 1,
    text: question.text,
    answer: '',
    confidence: 0,
    source: '',
    status: 'needs-input',
    flagReason: null,
    recommendation: null,
    suggestion: null,
    extraction: question.signals ? { score: question.score, signals: question.signals } : null,
  };

  // 1. A question we have answered before, closely enough to reuse.
  //
  // Score alone is not enough to write into the answer box. "What is your RTO?"
  // is a single meaningful token, so one coincidental hit can clear the
  // threshold on coverage alone. Auto-fill therefore also needs corroboration:
  // two or more distinct matched terms, or a semantic match strong enough to
  // stand by itself.
  const qaCorroborated =
    bestQa && (bestQa.matchedOn.length >= 2 || bestQa.semanticScore >= 0.85);

  if (bestQa && bestQa.score >= thresholds.QA_AUTOFILL && qaCorroborated) {
    return {
      ...base,
      answer: bestQa.chunk.text || '',
      confidence: pct(bestQa.score),
      status: 'auto-filled',
      source: qaSourceLabel(bestQa.chunk),
      suggestion: suggestionFrom(bestQa, 'reused'),
    };
  }

  // 2. Probably the same control, but not close enough to fill in unread —
  //    either the score is mid-range, or it is high on thin evidence.
  if (bestQa && bestQa.score >= thresholds.QA_SUGGEST) {
    const thinEvidence = bestQa.score >= thresholds.QA_AUTOFILL && !qaCorroborated;
    return {
      ...base,
      confidence: pct(bestQa.score),
      status: 'flagged',
      source: qaSourceLabel(bestQa.chunk),
      flagReason: thinEvidence
        ? `Possible repeat (${pct(bestQa.score)}%), but matched on only one term`
        : `Similar question answered before (${pct(bestQa.score)}% match)`,
      recommendation: `Check the previous answer from ${bestQa.chunk.sourceName || 'your history'} — accept it if it still holds.`,
      suggestion: suggestionFrom(bestQa, 'previous-answer'),
    };
  }

  // 3. A policy document covers this. Cite it; do not write it.
  if (bestDoc && bestDoc.score >= thresholds.DOC_SUGGEST) {
    const terms = displayTerms(bestDoc.matchedOn);
    return {
      ...base,
      confidence: pct(bestDoc.score),
      status: 'flagged',
      source: docSourceLabel(bestDoc.chunk),
      flagReason: `Covered by ${bestDoc.chunk.sourceName || 'a knowledge base document'}`,
      recommendation: terms.length
        ? `Draft from the cited passage — matched on ${terms.join(', ')}.`
        : 'Draft from the cited passage below.',
      suggestion: suggestionFrom(bestDoc, 'document'),
    };
  }

  // 4. Nothing useful. Say why, including when the reason is a degraded matcher.
  const near = bestQa || bestDoc;
  const detail = near
    ? `Closest match was only ${pct(near.score)}% (${near.chunk.sourceName || 'knowledge base'}).`
    : 'No related material in the knowledge base.';
  return needsInput(
    question,
    position,
    'Needs a manual answer',
    semanticOn
      ? `${detail} Answer it here and it will be reusable next time.`
      : `${detail} Keyword matching only — semantic matching is unavailable, so paraphrased matches may have been missed.`,
  );
}

function needsInput(question, position, flagReason, recommendation) {
  return {
    id: position + 1,
    text: question.text,
    answer: '',
    confidence: 0,
    source: '',
    status: 'needs-input',
    flagReason,
    recommendation,
    suggestion: null,
    extraction: question.signals ? { score: question.score, signals: question.signals } : null,
  };
}

function suggestionFrom(candidate, kind) {
  return {
    kind,
    chunkId: String(candidate.chunk.id),
    sourceType: candidate.chunk.sourceType,
    sourceName: candidate.chunk.sourceName || '',
    sourceId: candidate.chunk.sourceId || '',
    // Stamped by withCurrentSources at load time, so the reviewer can see
    // whether the passage they are about to reuse came from the current version
    // of a policy or from something imported a year ago.
    sourceDate: candidate.chunk.sourceDate || '',
    sourceSavedAt: candidate.chunk.sourceSavedAt || '',
    category: candidate.chunk.category || '',
    page: candidate.chunk.page ?? null,
    question: candidate.chunk.question || '',
    text: candidate.chunk.text || '',
    score: pct(candidate.score),
    lexical: pct(candidate.lexicalScore),
    semantic: pct(candidate.semanticScore),
    method: candidate.method,
    matchedOn: displayTerms(candidate.matchedOn, 5),
  };
}

/**
 * The other sources that could answer this question.
 *
 * One entry per source document or questionnaire, not per passage: three
 * passages from the same SOC 2 report are one choice, not three, and showing
 * them as three is how a picker becomes unusable. The best-scoring passage
 * represents its source.
 *
 * Kept to ALTERNATIVE_LIMIT above ALTERNATIVE_FLOOR, because a list that
 * includes everything the index coincidentally touched is a list nobody reads.
 */
function alternativesFrom(candidates, thresholds) {
  const bySource = new Map();
  for (const candidate of candidates) {
    if (candidate.score < ALTERNATIVE_FLOOR) continue;
    const key = `${candidate.chunk.sourceType}:${candidate.chunk.sourceId}`;
    // Candidates arrive sorted by score, so the first one wins its source.
    if (!bySource.has(key)) bySource.set(key, candidate);
    if (bySource.size >= ALTERNATIVE_LIMIT) break;
  }
  return [...bySource.values()].map((candidate) =>
    suggestionFrom(
      candidate,
      candidate.chunk.sourceType === 'qa'
        ? candidate.score >= thresholds.QA_AUTOFILL
          ? 'reused'
          : 'previous-answer'
        : 'document',
    ),
  );
}

const qaSourceLabel = (chunk) =>
  `Previously answered — ${chunk.sourceName || 'knowledge base'}`;

const docSourceLabel = (chunk) =>
  chunk.page
    ? `${chunk.sourceName || 'Document'} · p.${chunk.page}`
    : chunk.sourceName || 'Knowledge base document';

const pct = (score) => Math.round(Math.max(0, Math.min(1, score || 0)) * 100);

/* ── Summary ─────────────────────────────────────────────────────────────── */

const emptySummary = () => ({
  total: 0,
  autoFilled: 0,
  suggested: 0,
  needsInput: 0,
  indexedChunks: 0,
  semanticOn: false,
  semanticReason: null,
  coverage: 0,
});

function summarise(reviewed, extra) {
  const autoFilled = reviewed.filter((q) => q.status === 'auto-filled').length;
  const suggested = reviewed.filter((q) => q.status === 'flagged').length;
  const needsInput = reviewed.filter((q) => q.status === 'needs-input').length;
  return {
    total: reviewed.length,
    autoFilled,
    suggested,
    needsInput,
    coverage: reviewed.length > 0 ? Math.round(((autoFilled + suggested) / reviewed.length) * 100) : 0,
    ...extra,
  };
}

/** Exported for tests: does this text tokenise to anything matchable? */
export const isMatchable = (text) => tokenize(text).length > 0;
