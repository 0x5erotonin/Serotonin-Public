/**
 * Auto-review matching tests.
 *
 *   node tests/matching.spec.mjs
 *
 * Runs the real matcher against a small but realistic knowledge base, in three
 * configurations:
 *
 *   lexical-only  what a deploy without Bedrock does
 *   hybrid        with synthetic embeddings, so the semantic half is exercised
 *                 deterministically and without a network
 *   empty KB      the first-run case
 *
 * The assertions that matter most are the negative ones. A matcher that finds
 * something for every question is worse than useless in GRC: it launders
 * guesses as evidence. So there are checks that unrelated questions get nothing,
 * that a document passage is never auto-filled, and that a high score on a
 * single matched term is downgraded to a suggestion.
 */

import { autoReview, THRESHOLDS } from '../src/lib/matcher.js';
import { tokenize, search, buildIndex, cosine } from '../src/lib/textIndex.js';

let passed = 0;
const failures = [];
const check = (name, condition, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failures.push({ name, detail });
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

const TOPICS = ['mfa', 'rto', 'background', 'encryption', 'drtest', 'vendor', 'ciso'];
const vec = (weights) => TOPICS.map((topic) => weights[topic] || 0);

const chunkTopics = {
  qa1: { mfa: 1 },
  qa2: { rto: 1 },
  qa3: { background: 1 },
  doc1: { encryption: 1 },
  doc2: { drtest: 1 },
  doc3: { vendor: 1, ciso: 0.2 },
};

const CHUNKS = [
  {
    id: 'qa1', sourceType: 'qa', sourceId: 'kb1', sourceName: 'Globex Q2 2026',
    question: 'Do you require multi-factor authentication for administrative access?',
    text: 'Yes. MFA via hardware tokens or TOTP is enforced for all administrative and remote access.',
  },
  {
    id: 'qa2', sourceType: 'qa', sourceId: 'kb1', sourceName: 'Globex Q2 2026',
    question: 'What is your Recovery Time Objective?',
    text: 'Our RTO is 4 hours and our RPO is 15 minutes for tier-1 systems.',
  },
  {
    id: 'qa3', sourceType: 'qa', sourceId: 'kb2', sourceName: 'Initech 2025',
    question: 'Do you perform background checks on employees?',
    text: 'All employees undergo criminal background and employment verification checks before their start date.',
  },
  {
    id: 'doc1', sourceType: 'document', sourceId: 'd1', page: 12,
    sourceName: 'Information Security Policy.pdf',
    text: 'All customer data is encrypted at rest using AES-256 and in transit using TLS 1.3. Keys are managed in AWS KMS.',
  },
  {
    id: 'doc2', sourceType: 'document', sourceId: 'd2', page: 3,
    sourceName: 'Disaster Recovery Plan.pdf',
    text: 'The disaster recovery plan is tested twice annually via tabletop exercise and one full failover test.',
  },
  {
    id: 'doc3', sourceType: 'document', sourceId: 'd3', page: 5,
    sourceName: 'Vendor Management Policy.pdf',
    text: 'Third-party vendors are assessed prior to onboarding and reviewed annually by the CISO.',
  },
].map((chunk) => ({ ...chunk, embedding: vec(chunkTopics[chunk.id]) }));

const noSemantic = async () => ({ vectors: [], available: false, reason: 'test: semantic off' });

const withSemantic = (topicsByText) => async (texts) => ({
  vectors: texts.map((text) => (topicsByText[text] ? vec(topicsByText[text]) : null)),
  available: true,
  reason: null,
});

const q = (text) => ({ text, signals: [] });
const byText = (result, text) => result.questions.find((item) => item.text === text);

/* ── Tokeniser ────────────────────────────────────────────────────────────── */

{
  check('tokenizer: MFA and its long form collapse to one token',
    tokenize('multi-factor authentication').includes('mfa') && tokenize('MFA').includes('mfa'),
    JSON.stringify(tokenize('multi-factor authentication')));
  check('tokenizer: 2FA collapses too', tokenize('is 2FA required').includes('mfa'));
  check('tokenizer: "at rest" becomes one token, not two stopwords',
    tokenize('encrypted at rest').includes('atrest'), JSON.stringify(tokenize('encrypted at rest')));
  check('tokenizer: SOC 2 Type II normalises',
    tokenize('SOC 2 Type II report').includes('soc2'), JSON.stringify(tokenize('SOC 2 Type II report')));
  check('tokenizer: stopwords are dropped', !tokenize('do you have the').includes('you'));
  check('tokenizer: plurals stem together',
    tokenize('policies').join() === tokenize('policy').join(),
    `${tokenize('policies')} vs ${tokenize('policy')}`);
  check('tokenizer: empty input is safe', tokenize('').length === 0 && tokenize(null).length === 0);
}

/* ── BM25 ─────────────────────────────────────────────────────────────────── */

{
  const index = buildIndex([
    { id: 'a', text: 'All data is encrypted at rest with AES-256 and in transit with TLS 1.3.' },
    { id: 'b', text: 'Employees complete security awareness training annually.' },
  ]);
  const hits = search(index, 'Is data encrypted at rest and in transit?');
  check('bm25: ranks the encryption passage first', hits[0]?.id === 'a', JSON.stringify(hits));
  check('bm25: scores are bounded to 0..1',
    hits.every((hit) => hit.score >= 0 && hit.score <= 1), JSON.stringify(hits.map((h) => h.score)));
  check('bm25: reports which terms matched', (hits[0]?.matchedOn || []).includes('encryption'),
    JSON.stringify(hits[0]?.matchedOn));
  check('bm25: an unrelated query returns nothing',
    search(index, 'unladen swallow airspeed velocity').length === 0);
  check('bm25: empty index is safe', search(buildIndex([]), 'anything').length === 0);
}

/* ── Cosine ───────────────────────────────────────────────────────────────── */

{
  check('cosine: identical vectors score 1', Math.abs(cosine([1, 0, 0], [1, 0, 0]) - 1) < 1e-9);
  check('cosine: orthogonal vectors score 0', cosine([1, 0], [0, 1]) === 0);
  check('cosine: mismatched lengths score 0', cosine([1, 0], [1, 0, 0]) === 0);
  check('cosine: empty or malformed input scores 0',
    cosine([], []) === 0 && cosine(null, [1]) === 0 && cosine([0, 0], [0, 0]) === 0);
}

/* ── Lexical-only auto-review ─────────────────────────────────────────────── */

{
  const questions = [
    q('Do you require multi-factor authentication for administrative access?'),
    q('Is data encrypted at rest and in transit?'),
    q('How often is your disaster recovery plan tested?'),
    q('What is the airspeed velocity of an unladen swallow?'),
  ];
  const result = await autoReview(questions, { chunks: CHUNKS, embed: noSemantic });

  const repeat = byText(result, questions[0].text);
  check('lexical: an exact repeat is auto-filled',
    repeat.status === 'auto-filled' && repeat.answer.includes('MFA via hardware tokens'),
    `${repeat.status} / ${repeat.confidence}%`);
  check('lexical: the auto-filled answer is attributed to its source',
    /Previously answered/.test(repeat.source), repeat.source);

  const encryption = byText(result, questions[1].text);
  check('lexical: a document match is flagged, never auto-filled',
    encryption.status === 'flagged' && encryption.answer === '',
    `${encryption.status} / answer="${encryption.answer}"`);
  check('lexical: the document match cites its page',
    encryption.suggestion?.page === 12 && /Information Security Policy/.test(encryption.suggestion.sourceName),
    JSON.stringify(encryption.suggestion?.sourceName));
  check('lexical: the suggestion carries the passage text to accept',
    encryption.suggestion?.text?.includes('AES-256'));

  const dr = byText(result, questions[2].text);
  check('lexical: DR frequency finds the DR plan',
    dr.suggestion?.sourceName === 'Disaster Recovery Plan.pdf', dr.suggestion?.sourceName);

  const nonsense = byText(result, questions[3].text);
  check('lexical: an unrelated question gets nothing',
    nonsense.status === 'needs-input' && nonsense.suggestion === null && nonsense.confidence === 0,
    `${nonsense.status} / ${nonsense.confidence}%`);
  check('lexical: the manual case says why it is manual',
    /No related material|Closest match/.test(nonsense.recommendation || ''), nonsense.recommendation);
  check('lexical: a degraded run admits it in the recommendation',
    /semantic matching is unavailable/i.test(nonsense.recommendation || ''), nonsense.recommendation);

  check('lexical: summary counts add up',
    result.summary.total === 4 &&
      result.summary.autoFilled + result.summary.suggested + result.summary.needsInput === 4,
    JSON.stringify(result.summary));
  check('lexical: summary reports the semantic half as off', result.summary.semanticOn === false);
}

/* ── Hybrid ───────────────────────────────────────────────────────────────── */

{
  const paraphrase = 'Is MFA enforced for admin accounts?';
  const zeroOverlap = 'Who vets the companies you buy software from?';
  const questions = [q(paraphrase), q(zeroOverlap), q('What is your RTO?')];

  const lexicalRun = await autoReview(questions, { chunks: CHUNKS, embed: noSemantic });
  const hybridRun = await autoReview(questions, {
    chunks: CHUNKS,
    embed: withSemantic({
      [paraphrase]: { mfa: 0.95 },
      [zeroOverlap]: { vendor: 0.9 },
      'What is your RTO?': { rto: 0.95 },
    }),
  });

  const lexParaphrase = byText(lexicalRun, paraphrase);
  const hybParaphrase = byText(hybridRun, paraphrase);
  check('hybrid: semantic rescues a paraphrase that keywords only suggested',
    lexParaphrase.status === 'flagged' && hybParaphrase.status === 'auto-filled',
    `lexical=${lexParaphrase.status}(${lexParaphrase.confidence}%) hybrid=${hybParaphrase.status}(${hybParaphrase.confidence}%)`);
  check('hybrid: reports that both signals contributed',
    hybParaphrase.suggestion?.method === 'keyword + semantic', hybParaphrase.suggestion?.method);

  const lexZero = byText(lexicalRun, zeroOverlap);
  const hybZero = byText(hybridRun, zeroOverlap);
  check('hybrid: finds a passage with zero keyword overlap',
    lexZero.status === 'needs-input' && hybZero.status === 'flagged',
    `lexical=${lexZero.status} hybrid=${hybZero.status}`);
  check('hybrid: labels a keyword-less match as semantic',
    hybZero.suggestion?.method === 'semantic' && hybZero.suggestion?.lexical === 0,
    `${hybZero.suggestion?.method} lex=${hybZero.suggestion?.lexical}`);
  check('hybrid: that match is still only a suggestion, being a document',
    hybZero.answer === '' && hybZero.suggestion?.sourceType === 'document');

  check('hybrid: summary reports the semantic half as on', hybridRun.summary.semanticOn === true);
  check('hybrid: coverage improves over lexical alone',
    hybridRun.summary.coverage >= lexicalRun.summary.coverage,
    `${lexicalRun.summary.coverage}% → ${hybridRun.summary.coverage}%`);
}

/* ── Thin evidence must not auto-fill ─────────────────────────────────────── */

{
  // "RTO" is a single meaningful token. Coverage alone can clear the auto-fill
  // threshold, so without corroboration this would fill an answer off one word.
  const result = await autoReview([q('What is your RTO?')], {
    chunks: CHUNKS,
    embed: noSemantic,
  });
  const rto = result.questions[0];
  check('thin evidence: a single matched term does not auto-fill',
    rto.status === 'flagged' && rto.answer === '',
    `${rto.status} at ${rto.confidence}% with ${rto.suggestion?.matchedOn?.length} term(s)`);
  check('thin evidence: the scenario really is a single-term match',
    rto.suggestion?.matchedOn?.length === 1,
    JSON.stringify(rto.suggestion?.matchedOn));

  // With a strong semantic match as corroboration, the same question may fill.
  const corroborated = await autoReview([q('What is your RTO?')], {
    chunks: CHUNKS,
    embed: withSemantic({ 'What is your RTO?': { rto: 1 } }),
  });
  check('thin evidence: a strong semantic match is enough corroboration',
    corroborated.questions[0].status === 'auto-filled',
    corroborated.questions[0].status);
}

/* ── Empty knowledge base ─────────────────────────────────────────────────── */

{
  const result = await autoReview([q('Do you encrypt data at rest?')], {
    chunks: [],
    embed: noSemantic,
  });
  check('empty KB: everything needs a manual answer',
    result.questions[0].status === 'needs-input');
  check('empty KB: says the knowledge base is empty rather than "no match"',
    /empty/i.test(result.questions[0].flagReason || ''), result.questions[0].flagReason);
  check('empty KB: summary reports zero indexed passages', result.summary.indexedChunks === 0);
}

/* ── Degenerate inputs ────────────────────────────────────────────────────── */

{
  const empty = await autoReview([], { chunks: CHUNKS, embed: noSemantic });
  check('no questions: returns an empty result', empty.questions.length === 0);

  const blank = await autoReview([q('   '), q('')], { chunks: CHUNKS, embed: noSemantic });
  check('blank questions are filtered out', blank.questions.length === 0);

  const brokenEmbed = await autoReview([q('Is data encrypted at rest?')], {
    chunks: CHUNKS,
    embed: async () => { throw new Error('bedrock exploded'); },
  });
  check('a throwing embedder does not take the run down',
    brokenEmbed.questions.length === 1, JSON.stringify(brokenEmbed.summary));
}

/* ── Chunks with no embeddings, mixed with chunks that have them ──────────── */

{
  const mixed = CHUNKS.map((chunk, i) => (i % 2 === 0 ? { ...chunk, embedding: null } : chunk));
  const result = await autoReview([q('Is data encrypted at rest and in transit?')], {
    chunks: mixed,
    embed: withSemantic({ 'Is data encrypted at rest and in transit?': { encryption: 0.9 } }),
  });
  check('mixed index: un-embedded chunks still match lexically',
    result.questions[0].status === 'flagged',
    `${result.questions[0].status} via ${result.questions[0].suggestion?.method}`);
}

/* ── Thresholds are the documented ones ──────────────────────────────────── */

{
  check('thresholds: documents never auto-fill regardless of score',
    THRESHOLDS.DOC_SUGGEST < THRESHOLDS.QA_AUTOFILL);
  check('thresholds: suggest sits below auto-fill',
    THRESHOLDS.QA_SUGGEST < THRESHOLDS.QA_AUTOFILL);
}

/* ── Malformed embeddings must not poison a run ───────────────────────────── */

{
  // Regression test. `cosine` returned NaN for a same-length vector containing a
  // non-number; NaN passed the `score <= 0` guard, broke the sort comparator and
  // failed every threshold comparison — so one corrupt row turned every question
  // in the run into "needs a manual answer", silently.
  const question = 'Do you require multi-factor authentication for administrative access?';
  const poisoned = [
    ...CHUNKS,
    {
      id: 'bad1', sourceType: 'document', sourceId: 'dx', sourceName: 'Corrupt.pdf',
      text: 'Corrupt vector row about authentication and access.',
      embedding: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    },
    {
      id: 'bad2', sourceType: 'document', sourceId: 'dy', sourceName: 'Corrupt2.pdf',
      text: 'Another corrupt row about encryption.',
      embedding: [1, 2, Number.NaN, 4, 5, 6, 7],
    },
  ];

  const result = await autoReview([q(question)], {
    chunks: poisoned,
    embed: withSemantic({ [question]: { mfa: 0.95 } }),
  });
  check(
    'a corrupt embedding does not break the rest of the run',
    result.questions[0].status === 'auto-filled',
    `${result.questions[0].status} @ ${result.questions[0].confidence}%`,
  );
  check(
    'confidence stays a real number',
    Number.isFinite(result.questions[0].confidence),
    String(result.questions[0].confidence),
  );

  // Dimension mismatch: a chunk indexed at a different embedding size.
  const mismatched = CHUNKS.map((c) => ({ ...c, embedding: [...c.embedding, 0, 0, 0] }));
  const stale = await autoReview([q(question)], {
    chunks: mismatched,
    embed: withSemantic({ [question]: { mfa: 0.95 } }),
  });
  check(
    'a dimension mismatch is reported rather than silently disabling semantic matching',
    stale.summary.staleVectors === mismatched.length &&
      /different embedding size/i.test(stale.summary.semanticReason || ''),
    `stale=${stale.summary.staleVectors} reason=${stale.summary.semanticReason}`,
  );
  check(
    'a dimension mismatch still leaves lexical matching working',
    stale.questions[0].status === 'auto-filled',
    stale.questions[0].status,
  );
}

/* ── Performance: a big index and long questions stay responsive ──────────── */

{
  // Regression test. The phrase bonus used to compute the longest shared token
  // run per candidate, at O(n³), worst case when there was no phrase match —
  // the common case. Measured at 3.6s for one 60-token question against a
  // 1,200-chunk index; a 50-question run took minutes with the UI frozen.
  const vocab = ('encryption access control policy incident response backup audit training vendor ' +
    'retention monitoring logging privilege credential employee certification transit rest key rotation')
    .split(' ');
  const bigIndex = Array.from({ length: 1200 }, (_, i) => ({
    id: `c${i}`,
    sourceType: i % 4 === 0 ? 'qa' : 'document',
    sourceId: `s${i % 40}`,
    sourceName: `Doc ${i % 40}.pdf`,
    question: i % 4 === 0 ? `Question ${i} about ${vocab[i % vocab.length]}?` : '',
    text: Array.from({ length: 40 }, (_, j) => vocab[(i + j * 7) % vocab.length]).join(' '),
    embedding: null,
  }));

  const longQuestion = Array.from({ length: 60 }, (_, i) => vocab[(i * 3) % vocab.length]).join(' ');
  const many = Array.from({ length: 25 }, (_, i) => q(`${longQuestion} variant ${i}?`));

  const started = Date.now();
  const result = await autoReview(many, { chunks: bigIndex, embed: noSemantic });
  const elapsed = Date.now() - started;
  check(
    'performance: 25 long questions against a 1,200-passage index',
    elapsed < 15000,
    `took ${elapsed}ms (${Math.round(elapsed / many.length)}ms per question)`,
  );
  check('the big run still produced a result for every question',
    result.questions.length === many.length);
}

/* ── Summary ──────────────────────────────────────────────────────────────── */

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`);
  process.exit(1);
}
