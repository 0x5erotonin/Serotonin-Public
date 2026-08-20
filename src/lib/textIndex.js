/**
 * Lexical retrieval — the half of the hybrid matcher that needs no network.
 *
 * BM25 over the knowledge base, with two additions that matter a lot on
 * security questionnaires specifically:
 *
 *   • A GRC synonym map. "Is MFA enforced?" and "Do you require multi-factor
 *     authentication?" share no tokens at all. Expanding both sides to a common
 *     canonical form is what makes keyword matching viable here.
 *   • Term coverage weighted alongside the BM25 score. Raw BM25 is unbounded and
 *     can be dominated by one rare term, which produces confident nonsense.
 *     Coverage ("matched 4 of 6 key terms") is bounded, explainable, and is what
 *     the UI shows the analyst.
 *
 * Everything is a pure function so it can be unit-tested in Node.
 */

/* ── Stopwords ────────────────────────────────────────────────────────────── */

const STOPWORDS = new Set(
  `a an the and or but if then than that this these those of in on at to for from by with without
   is are was were be been being do does did doing have has had having will would shall should can
   could may might must not no nor as it its it's you your yours we our ours they their them there
   here how what when where which who whom why any all each other some such only own same so too very
   about across after against along among around because before between during into over under upon
   within please provide describe explain list specify identify confirm indicate state detail outline
   organization organisation organizations company companies vendor please also more most much many`
    .split(/\s+/)
    .filter(Boolean),
);

/* ── GRC synonyms ─────────────────────────────────────────────────────────── */

/**
 * Maps surface forms to a canonical token. Multi-word keys are matched as
 * phrases before single-token processing, so "multi factor authentication"
 * collapses to `mfa` the same way the acronym does.
 *
 * Deliberately conservative: only pairs that are genuinely interchangeable in
 * this domain. Over-expanding here creates false matches, which are worse than
 * misses because they arrive wearing a confidence score.
 */
const SYNONYM_PHRASES = [
  [/\bmulti[- ]?factor authentication\b/g, ' mfa '],
  [/\btwo[- ]?factor authentication\b/g, ' mfa '],
  [/\b2fa\b/g, ' mfa '],
  [/\bsingle sign[- ]?on\b/g, ' sso '],
  [/\bat rest\b/g, ' atrest '],
  [/\bin transit\b/g, ' intransit '],
  [/\bin flight\b/g, ' intransit '],
  [/\bdisaster recovery\b/g, ' dr '],
  [/\bbusiness continuity\b/g, ' bcp '],
  [/\bincident response\b/g, ' incidentresponse '],
  [/\brecovery time objective\b/g, ' rto '],
  [/\brecovery point objective\b/g, ' rpo '],
  [/\bpenetration test(?:ing)?\b/g, ' pentest '],
  [/\bvulnerability (?:scan(?:ning)?|management|assessment)\b/g, ' vulnmgmt '],
  [/\bbackground check(?:s)?\b/g, ' backgroundcheck '],
  [/\bleast privilege\b/g, ' leastprivilege '],
  [/\brole[- ]based access control\b/g, ' rbac '],
  [/\baccess control\b/g, ' accesscontrol '],
  [/\bdata retention\b/g, ' retention '],
  [/\bdata loss prevention\b/g, ' dlp '],
  [/\bsecurity awareness training\b/g, ' securitytraining '],
  [/\bservice organization control\b/g, ' soc '],
  [/\bsoc\s*2(?:\s*type\s*(?:ii|2))?\b/g, ' soc2 '],
  [/\biso[\s-]?27001\b/g, ' iso27001 '],
  [/\bpci[\s-]?dss\b/g, ' pcidss '],
  [/\bbusiness associate agreement\b/g, ' baa '],
  [/\bdata processing agreement\b/g, ' dpa '],
  [/\bpersonally identifiable information\b/g, ' pii '],
  [/\bprotected health information\b/g, ' phi '],
  [/\bencrypt(?:ion|ed|ing)?\b/g, ' encryption '],
  [/\bauthenticat(?:e|ed|ion|ing)\b/g, ' authentication '],
  [/\bauthoriz(?:e|ed|ation)\b/g, ' authorization '],
  [/\bde[- ]?provision(?:ing|ed)?\b/g, ' deprovision '],
  [/\bprovision(?:ing|ed)?\b/g, ' provision '],
  [/\bthird[- ]part(?:y|ies)\b/g, ' thirdparty '],
  [/\bsub[- ]?processor(?:s)?\b/g, ' subprocessor '],
];

const SYNONYM_TOKENS = new Map(
  Object.entries({
    mfa: 'mfa',
    sso: 'sso',
    dr: 'dr',
    bcp: 'bcp',
    rto: 'rto',
    rpo: 'rpo',
    pentest: 'pentest',
    soc2: 'soc2',
    pii: 'pii',
    phi: 'phi',
    baa: 'baa',
    dpa: 'dpa',
    rbac: 'rbac',
    dlp: 'dlp',
    // Abbreviations questionnaires use interchangeably with the full word.
    // "Is MFA enforced for admin accounts?" has to reach "...for administrative
    // access" — without this the two share only one token.
    admin: 'administrative',
    admins: 'administrative',
    administrator: 'administrative',
    administrators: 'administrative',
    administration: 'administrative',
    privileged: 'administrative',
    superuser: 'administrative',
    root: 'administrative',
    // plain-language equivalents
    password: 'credential',
    passwords: 'credential',
    credential: 'credential',
    credentials: 'credential',
    staff: 'employee',
    employees: 'employee',
    employee: 'employee',
    personnel: 'employee',
    workforce: 'employee',
    supplier: 'thirdparty',
    suppliers: 'thirdparty',
    subcontractor: 'thirdparty',
    subcontractors: 'thirdparty',
    breach: 'incident',
    breaches: 'incident',
    incident: 'incident',
    incidents: 'incident',
    policy: 'policy',
    policies: 'policy',
    procedure: 'policy',
    procedures: 'policy',
    audit: 'audit',
    audits: 'audit',
    audited: 'audit',
    certification: 'certification',
    certified: 'certification',
    certifications: 'certification',
    backup: 'backup',
    backups: 'backup',
    logging: 'logging',
    log: 'logging',
    logs: 'logging',
    monitoring: 'monitoring',
    monitor: 'monitoring',
    monitored: 'monitoring',
  }),
);

/* ── Tokenisation ─────────────────────────────────────────────────────────── */

/**
 * Light stemming: strip common inflections without pulling in a stemmer.
 * Aggressive stemming hurts here — "auditing" and "auditor" are different
 * things in a compliance answer.
 */
function stem(token) {
  if (token.length <= 4) return token;
  if (token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.endsWith('sses')) return token.slice(0, -2);
  if (token.endsWith('ses')) return token.slice(0, -1);
  if (token.endsWith('s') && !token.endsWith('ss') && !token.endsWith('us')) return token.slice(0, -1);
  if (token.endsWith('ing') && token.length > 6) return token.slice(0, -3);
  if (token.endsWith('ed') && token.length > 5) return token.slice(0, -2);
  return token;
}

export function tokenize(text) {
  let normalised = ` ${String(text || '').toLowerCase()} `;
  for (const [pattern, replacement] of SYNONYM_PHRASES) {
    normalised = normalised.replace(pattern, replacement);
  }
  return normalised
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !STOPWORDS.has(token))
    .map((token) => SYNONYM_TOKENS.get(token) || stem(token))
    .filter((token) => token.length > 1);
}

/** Normalised word sequence, for phrase-match detection. */
export function normalisedPhrase(text) {
  return ` ${tokenize(text).join(' ')} `;
}

/* ── Index ────────────────────────────────────────────────────────────────── */

/**
 * @param docs [{ id, text }]
 * @returns index consumed by `search`
 */
export function buildIndex(docs) {
  const entries = [];
  const df = new Map();

  for (const doc of docs) {
    const tokens = tokenize(doc.text);
    const tf = new Map();
    for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1);
    for (const token of tf.keys()) df.set(token, (df.get(token) || 0) + 1);
    entries.push({ id: doc.id, tf, length: tokens.length, phrase: ` ${tokens.join(' ')} ` });
  }

  const totalLength = entries.reduce((sum, e) => sum + e.length, 0);
  return {
    entries,
    df,
    count: entries.length,
    avgLength: entries.length > 0 ? totalLength / entries.length : 0,
  };
}

const K1 = 1.5;
const B = 0.75;
/** BM25 saturation constant — maps an unbounded score into 0..1. */
const SATURATION = 6;

/**
 * Score every indexed document against a query.
 *
 * Returns `[{ id, score, coverage, bm25, matchedOn }]` sorted best first, where
 * `score` is 0..1:
 *
 *     score = 0.6 · coverage + 0.4 · saturate(bm25) + phrase bonus
 *
 * Coverage carries the most weight on purpose: for "can we answer this
 * question?", how many of the question's meaningful terms appear at all is a
 * better signal than how heavily any one of them is weighted.
 */
export function search(index, queryText, { limit = 10 } = {}) {
  const queryTokens = tokenize(queryText);
  if (queryTokens.length === 0 || index.count === 0) return [];

  const uniqueQueryTokens = [...new Set(queryTokens)];
  // Computed once per query rather than per candidate — see phraseRuns().
  const queryRuns = phraseRuns(queryTokens);
  const results = [];

  for (const entry of index.entries) {
    let bm25 = 0;
    const matchedOn = [];

    for (const token of uniqueQueryTokens) {
      const termFrequency = entry.tf.get(token);
      if (!termFrequency) continue;
      matchedOn.push(token);
      const documentFrequency = index.df.get(token) || 0;
      // BM25 IDF, floored at a small positive value: a term present in every
      // document would otherwise contribute a negative score.
      const idf = Math.max(
        0.05,
        Math.log(1 + (index.count - documentFrequency + 0.5) / (documentFrequency + 0.5)),
      );
      const norm =
        termFrequency +
        K1 * (1 - B + (B * entry.length) / (index.avgLength || 1));
      bm25 += idf * ((termFrequency * (K1 + 1)) / (norm || 1));
    }

    if (matchedOn.length === 0) continue;

    const coverage = matchedOn.length / uniqueQueryTokens.length;
    const saturated = bm25 / (bm25 + SATURATION);
    const phraseBonus = queryRuns.some((run) => entry.phrase.includes(run)) ? 0.15 : 0;
    const score = Math.min(1, 0.6 * coverage + 0.4 * saturated + phraseBonus);

    results.push({ id: entry.id, score, coverage, bm25, matchedOn });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/** Minimum consecutive-token run that earns the phrase bonus. */
const PHRASE_RUN = 3;
/** Cap on runs tested per query, so a pathologically long question stays cheap. */
const MAX_PHRASE_RUNS = 48;

/**
 * The query's consecutive token runs, as padded strings ready for `includes`.
 *
 * A shared 3-word run ("encryption atrest intransit") is strong evidence two
 * texts describe the same control, which single-term overlap is not. All that is
 * needed is *whether* such a run exists, so this replaces an earlier function
 * that computed the longest shared run per candidate.
 *
 * That earlier version was O(n³) per candidate and, because it only stopped
 * early on a hit, hit its worst case exactly when there was no phrase match —
 * the common case. Measured at 3.6s for one 60-token question against a
 * 1,200-chunk index, i.e. minutes for a full questionnaire, with the main thread
 * blocked throughout. Precomputing the runs once per query makes the per-
 * candidate cost a handful of substring searches.
 */
function phraseRuns(tokens) {
  if (tokens.length < PHRASE_RUN) return [];
  const runs = [];
  for (let start = 0; start + PHRASE_RUN <= tokens.length && runs.length < MAX_PHRASE_RUNS; start += 1) {
    runs.push(` ${tokens.slice(start, start + PHRASE_RUN).join(' ')} `);
  }
  return runs;
}

/** Turn canonical tokens back into something readable for the UI. */
const DISPLAY_NAMES = {
  mfa: 'multi-factor auth',
  sso: 'single sign-on',
  dr: 'disaster recovery',
  bcp: 'business continuity',
  rto: 'RTO',
  rpo: 'RPO',
  pentest: 'penetration testing',
  soc2: 'SOC 2',
  atrest: 'at rest',
  intransit: 'in transit',
  incidentresponse: 'incident response',
  vulnmgmt: 'vulnerability management',
  accesscontrol: 'access control',
  leastprivilege: 'least privilege',
  backgroundcheck: 'background checks',
  securitytraining: 'security training',
  thirdparty: 'third parties',
  subprocessor: 'sub-processors',
  iso27001: 'ISO 27001',
  pcidss: 'PCI DSS',
  baa: 'BAA',
  dpa: 'DPA',
  pii: 'PII',
  phi: 'PHI',
  rbac: 'RBAC',
  dlp: 'DLP',
};

export function displayTerms(tokens, limit = 4) {
  return [...new Set(tokens)]
    .map((token) => DISPLAY_NAMES[token] || token)
    .slice(0, limit);
}

/* ── Vector similarity ───────────────────────────────────────────────────── */

/**
 * Cosine similarity. Titan vectors are unit-normalised, so this is a dot product.
 *
 * Returns 0 — never NaN — for anything malformed. That matters more than it
 * looks: a single non-numeric entry in one stored vector used to produce NaN,
 * which survived a `score <= 0` guard, poisoned the sort comparator, and turned
 * every question in the run into "needs a manual answer" with no diagnostic.
 */
export function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    dot += x * y;
    magA += x * x;
    magB += y * y;
  }
  if (magA === 0 || magB === 0) return 0;
  const similarity = dot / (Math.sqrt(magA) * Math.sqrt(magB));
  return Number.isFinite(similarity) ? similarity : 0;
}
