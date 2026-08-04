/**
 * Per-task evaluation fixtures and deterministic rubrics for `ai:evaluate`.
 *
 * One responsibility: define what "a model can do this task" means. There is no
 * network code here, so the rubrics are pure functions and are unit tested
 * against canned model output.
 *
 * Every check carries `workerEnforced`:
 *
 * - `true`  — the check mirrors a validator in `worker/index.ts`. Output that
 *             fails it would be rejected in production as
 *             `UPSTREAM_INVALID_RESPONSE`. `tests/worker/ai-eval-parity.test.ts`
 *             pins this subset to the real Worker, accept-for-accept and
 *             reject-for-reject.
 * - `false` — a quality or hallucination heuristic that is deliberately
 *             stricter than the Worker. The Worker cannot enforce it (it is a
 *             prompt-level expectation), but a model that fails it is not one
 *             we want to deploy. Tested here only.
 *
 * `scoreFixture(...).passed` is the conjunction of *all* checks, so the
 * `pass.rate === 1` deployment bar stays the strict one.
 *
 * The catalogs below duplicate `src/lib/ai/schemas.ts` because a plain Node
 * script cannot import a Zod-bearing TypeScript module.
 * `src/lib/ai/eval-catalog-parity.test.ts` fails if they drift apart.
 */

export const EVAL_TOP_CODE_CATALOG = Object.freeze({
  '1701.00': 'Mathematics, General',
  '1501.00': 'English',
  '0707.00': 'Computer Information Systems',
  '0401.00': 'Biological Sciences',
  '2001.00': 'Psychology, General',
  '0505.00': 'Business Administration',
  '1002.00': 'Art',
  '2205.00': 'History',
  '1905.00': 'Chemistry, General',
  '1230.00': 'Nursing',
  '1012.00': 'Applied Photography',
  '0956.00': 'Manufacturing Technology',
  '2101.00': 'Sociology',
  '0835.00': 'Child Development/Early Care and Education',
  '1301.00': 'Communication Studies',
  '1901.00': 'Physical Sciences, General',
  '2202.00': 'Political Science',
  '2203.00': 'Economics',
  '0502.00': 'Accounting',
  '0701.00': 'Information Technology, General',
});

export const EVAL_COMPLIANCE_SOURCE_PACK = Object.freeze({
  'title5-course-standards': Object.freeze({
    sourceTitle: 'California Code of Regulations, title 5, section 55002',
    sourceSection: '§ 55002(a)(1)(C), Units',
    excerpt:
      'Course outlines of record shall record the total number of hours in each instructional category specified in governing board policy.',
  }),
  'title5-credit-hour': Object.freeze({
    sourceTitle: 'California Code of Regulations, title 5, section 55002.5',
    sourceSection: '§ 55002.5(a), Credit Hour Definition',
    excerpt:
      'One credit hour of community college work (one unit of credit) shall require a minimum of 48 semester hours of total student work.',
  }),
  'pcah-current-edition': Object.freeze({
    sourceTitle:
      'California Community Colleges Program and Course Approval Handbook, 8th Edition',
    sourceSection: 'p. 44, Criteria for the Course Outline of Record',
    excerpt:
      'The Chancellor’s Office review and chaptering processes require the submission of a COR that meets the standards for courses established in Title 5, § 55002.',
  }),
  'ccn-current-guidance': Object.freeze({
    sourceTitle: 'California Education Code section 66725.5',
    sourceSection: '§ 66725.5(a)(2), Common Course Numbering System',
    excerpt:
      'ensure that comparable courses across all community colleges have the same course number.',
  }),
});

const TOP_CODE_VALUES = Object.keys(EVAL_TOP_CODE_CATALOG);
const COMPLIANCE_SOURCE_IDS = Object.keys(EVAL_COMPLIANCE_SOURCE_PACK);

const OUTLINE_TOTAL_CONTACT_HOURS = 54;
const OUTLINE_SLO_POSITIONS = [1, 2];
const OUTLINE_HOURS_TOLERANCE = 0.01;
const RELEVANT_TOP_CODES = ['0707.00', '0701.00'];

// Shared with scripts/ai-evaluate.mjs so the schema pattern and the rubric
// cannot disagree about what counts as an action verb.
export const ACTION_VERBS = Object.freeze([
  'Analyze',
  'Apply',
  'Compare',
  'Construct',
  'Create',
  'Demonstrate',
  'Design',
  'Evaluate',
  'Explain',
  'Identify',
  'Implement',
  'Interpret',
  'Solve',
]);
export const ACTION_VERB_PATTERN = `^(${ACTION_VERBS.join('|')})\\b`;

const APPROVAL_CLAIM_PATTERN =
  /\b(approved|approval|guaranteed|certifies|certified)\b/i;

function parseJson(content) {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value);
  const allowed = new Set(expected);
  return (
    actual.length === expected.length &&
    actual.every((key) => allowed.has(key))
  );
}

/** Mirrors the Worker's requireString: trims, then bounds the trimmed length. */
function isBoundedString(value, maximumLength, allowEmpty = false) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  if (!allowEmpty && !normalized) return false;
  return normalized.length <= maximumLength;
}

function wordCount(value) {
  return value.split(/\s+/).filter(Boolean).length;
}

function uniqueIgnoringCase(values) {
  const normalized = values.map((value) => value.trim().toLowerCase());
  return new Set(normalized).size === normalized.length;
}

function complianceSourcePackPrompt() {
  return COMPLIANCE_SOURCE_IDS.map((sourceId) => {
    const source = EVAL_COMPLIANCE_SOURCE_PACK[sourceId];
    return [
      `[${sourceId}]`,
      `title: ${source.sourceTitle}`,
      `page_or_section: ${source.sourceSection}`,
      `excerpt: ${source.excerpt}`,
    ].join('\n');
  }).join('\n');
}

function topCodeCatalogPrompt() {
  return TOP_CODE_VALUES.map(
    (code) => `${code} — ${EVAL_TOP_CODE_CATALOG[code]}`,
  ).join('\n');
}

const CHAT_FIXTURE = {
  task: 'chat',
  kind: 'plain',
  maxTokens: 160,
  messages: [
    {
      role: 'system',
      content:
        'You are being evaluated as a concise curriculum-writing assistant. Follow the user request exactly and do not add headings, lists, or JSON. Never present a suggestion as an approval.',
    },
    {
      role: 'user',
      content:
        'In one sentence of 12 to 45 words, explain why measurable course outcomes help curriculum review. Use both the words "outcomes" and "review".',
    },
  ],
  checks: [
    {
      id: 'non-empty',
      workerEnforced: true,
      run(value) {
        return isBoundedString(value, 12_000);
      },
    },
    {
      id: 'single-paragraph',
      workerEnforced: false,
      run(value) {
        return !value.includes('\n') && wordCount(value) >= 12 &&
          wordCount(value) <= 45;
      },
    },
    {
      id: 'not-json',
      workerEnforced: false,
      run(value) {
        const parsed = parseJson(value);
        return parsed === null || typeof parsed !== 'object';
      },
    },
    {
      id: 'no-approval-claim',
      workerEnforced: false,
      run(value) {
        return !APPROVAL_CLAIM_PATTERN.test(value);
      },
    },
  ],
};

const CATALOG_DESCRIPTION_FIXTURE = {
  task: 'catalog-description',
  kind: 'structured',
  maxTokens: 400,
  messages: [
    {
      role: 'system',
      content:
        'Draft one concise, student-facing catalog description from the supplied course data. Do not invent prerequisites, transfer status, approvals, units, hours, or regulatory claims. Return only the required JSON object.',
    },
    {
      role: 'user',
      content:
        'Course: TEST 100, Curriculum Workflow Fundamentals. Topics: the course outline of record; the local curriculum review workflow. No prerequisites, corequisites, or advisories have been supplied. Write 25 to 120 words.',
    },
  ],
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      description: {
        type: 'string',
        minLength: 1,
        maxLength: 1600,
      },
    },
    required: ['description'],
  },
  checks: [
    {
      id: 'exact-keys',
      workerEnforced: true,
      run(value) {
        return (
          hasExactKeys(value, ['description']) &&
          isBoundedString(value.description, 1600)
        );
      },
    },
    {
      id: 'length-within-1600',
      workerEnforced: true,
      run(value) {
        return isBoundedString(value.description, 1600);
      },
    },
    {
      id: 'word-count-25-120',
      workerEnforced: false,
      run(value) {
        const words = wordCount(String(value.description ?? '').trim());
        return words >= 25 && words <= 120;
      },
    },
    {
      id: 'no-invented-prerequisite',
      workerEnforced: false,
      run(value) {
        return !/\bprerequisite/i.test(String(value.description ?? ''));
      },
    },
  ],
};

const SLOS_FIXTURE = {
  task: 'slos',
  kind: 'structured',
  maxTokens: 400,
  messages: [
    {
      role: 'system',
      content:
        'Draft two distinct, observable student learning outcomes from the supplied synthetic course data. Each outcome should describe what a successful student can demonstrate by the end of the course. Avoid promises about approval or compliance. Return only the required JSON object.',
    },
    {
      role: 'user',
      content:
        'Course: TEST 100, Curriculum Workflow Fundamentals. Topics: measurable learning outcomes; local curriculum review workflow. Each outcome must begin with an action verb allowed by the response schema.',
    },
  ],
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      slos: {
        type: 'array',
        minItems: 1,
        maxItems: 6,
        items: {
          type: 'string',
          minLength: 1,
          maxLength: 350,
          pattern: ACTION_VERB_PATTERN,
        },
      },
    },
    required: ['slos'],
  },
  checks: [
    {
      id: 'exact-keys',
      workerEnforced: true,
      run(value) {
        return hasExactKeys(value, ['slos']) && Array.isArray(value.slos);
      },
    },
    {
      id: 'count-1-to-6',
      workerEnforced: true,
      run(value) {
        return value.slos.length >= 1 && value.slos.length <= 6;
      },
    },
    {
      id: 'length-within-350',
      workerEnforced: true,
      run(value) {
        return value.slos.every((slo) => isBoundedString(slo, 350));
      },
    },
    {
      id: 'unique-outcomes',
      workerEnforced: true,
      run(value) {
        return (
          value.slos.every((slo) => typeof slo === 'string') &&
          uniqueIgnoringCase(value.slos)
        );
      },
    },
    {
      id: 'action-verb-start',
      workerEnforced: false,
      run(value) {
        const pattern = new RegExp(ACTION_VERB_PATTERN);
        return value.slos.every(
          (slo) => typeof slo === 'string' && pattern.test(slo.trim()),
        );
      },
    },
  ],
};

const CONTENT_OUTLINE_FIXTURE = {
  task: 'content-outline',
  kind: 'structured',
  maxTokens: 700,
  messages: [
    {
      role: 'system',
      content:
        'Draft a sequenced course content outline from the supplied course data. Number topics consecutively from one. Allocate positive contact hours and preserve the supplied total contact hours exactly. Related SLO numbers must refer only to supplied SLO positions. Return only the required JSON object.',
    },
    {
      role: 'user',
      content: `Course: TEST 100, Curriculum Workflow Fundamentals. Total contact hours: ${OUTLINE_TOTAL_CONTACT_HOURS}. Supplied SLOs: (1) Analyze a course outline of record; (2) Evaluate a proposed curriculum change. Produce two to five topics whose contactHours sum to exactly ${OUTLINE_TOTAL_CONTACT_HOURS}.`,
    },
  ],
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      topics: {
        type: 'array',
        minItems: 1,
        maxItems: 20,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sequence: {
              type: 'integer',
              minimum: 1,
              maximum: 20,
            },
            topic: {
              type: 'string',
              minLength: 1,
              maxLength: 500,
            },
            contactHours: {
              type: 'number',
              exclusiveMinimum: 0,
              maximum: 500,
            },
            relatedSloNumbers: {
              type: 'array',
              maxItems: 6,
              uniqueItems: true,
              items: {
                type: 'integer',
                minimum: 1,
                maximum: 6,
              },
            },
          },
          required: [
            'sequence',
            'topic',
            'contactHours',
            'relatedSloNumbers',
          ],
        },
      },
    },
    required: ['topics'],
  },
  checks: [
    {
      id: 'exact-keys',
      workerEnforced: true,
      run(value) {
        return (
          hasExactKeys(value, ['topics']) &&
          Array.isArray(value.topics) &&
          value.topics.length >= 1 &&
          value.topics.length <= 20
        );
      },
    },
    {
      id: 'topic-keys-exact',
      workerEnforced: true,
      run(value) {
        return value.topics.every(
          (topic) =>
            hasExactKeys(topic, [
              'sequence',
              'topic',
              'contactHours',
              'relatedSloNumbers',
            ]) && isBoundedString(topic.topic, 500),
        );
      },
    },
    {
      id: 'sequence-consecutive',
      workerEnforced: true,
      run(value) {
        return value.topics.every(
          (topic, index) =>
            Number.isSafeInteger(topic.sequence) &&
            topic.sequence <= 20 &&
            topic.sequence === index + 1,
        );
      },
    },
    {
      id: 'positive-hours',
      workerEnforced: true,
      run(value) {
        return value.topics.every(
          (topic) =>
            typeof topic.contactHours === 'number' &&
            Number.isFinite(topic.contactHours) &&
            topic.contactHours > 0 &&
            topic.contactHours <= 500,
        );
      },
    },
    {
      id: 'hours-sum-exact',
      workerEnforced: true,
      run(value) {
        const total = value.topics.reduce(
          (sum, topic) => sum + topic.contactHours,
          0,
        );
        return (
          Math.abs(total - OUTLINE_TOTAL_CONTACT_HOURS) <=
          OUTLINE_HOURS_TOLERANCE
        );
      },
    },
    {
      id: 'related-slos-valid',
      workerEnforced: true,
      run(value) {
        return value.topics.every((topic) => {
          if (!Array.isArray(topic.relatedSloNumbers)) return false;
          if (topic.relatedSloNumbers.length > 6) return false;
          if (
            new Set(topic.relatedSloNumbers).size !==
            topic.relatedSloNumbers.length
          ) {
            return false;
          }
          return topic.relatedSloNumbers.every(
            (position) =>
              Number.isSafeInteger(position) &&
              position >= 1 &&
              position <= 6,
          );
        });
      },
    },
    {
      id: 'related-slos-supplied',
      workerEnforced: false,
      run(value) {
        return value.topics.every(
          (topic) =>
            Array.isArray(topic.relatedSloNumbers) &&
            topic.relatedSloNumbers.every((position) =>
              OUTLINE_SLO_POSITIONS.includes(position),
            ),
        );
      },
    },
  ],
};

const TOP_CODE_FIXTURE = {
  task: 'top-code',
  kind: 'structured',
  maxTokens: 600,
  messages: [
    {
      role: 'system',
      content: [
        'Suggest one to three California Taxonomy of Programs (TOP) codes from the supplied curriculum data.',
        'Use only the exact code and title pairs in the server-owned demo catalog below.',
        'Explain uncertainty and never claim that a suggestion is an official assignment.',
        'Return only the required JSON object.',
        '',
        'SERVER-OWNED DEMO TOP CATALOG',
        topCodeCatalogPrompt(),
      ].join('\n'),
    },
    {
      role: 'user',
      content:
        'Course: TEST 100, Introduction to Programming. Students write, trace, and debug small programs, and study data types, control flow, and functions. Suggest the closest TOP codes from the catalog.',
    },
  ],
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      suggestions: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            code: {
              type: 'string',
              enum: TOP_CODE_VALUES,
            },
            title: {
              type: 'string',
              minLength: 1,
              maxLength: 200,
            },
            rationale: {
              type: 'string',
              minLength: 1,
              maxLength: 700,
            },
            confidence: {
              type: 'number',
              minimum: 0,
              maximum: 1,
            },
          },
          required: ['code', 'title', 'rationale', 'confidence'],
        },
      },
    },
    required: ['suggestions'],
  },
  checks: [
    {
      id: 'exact-keys',
      workerEnforced: true,
      run(value) {
        return (
          hasExactKeys(value, ['suggestions']) &&
          Array.isArray(value.suggestions)
        );
      },
    },
    {
      id: 'count-1-to-3',
      workerEnforced: true,
      run(value) {
        return (
          value.suggestions.length >= 1 && value.suggestions.length <= 3
        );
      },
    },
    {
      id: 'suggestion-keys-exact',
      workerEnforced: true,
      run(value) {
        return value.suggestions.every(
          (suggestion) =>
            hasExactKeys(suggestion, [
              'code',
              'title',
              'rationale',
              'confidence',
            ]) &&
            isBoundedString(suggestion.code, 7) &&
            isBoundedString(suggestion.title, 200) &&
            isBoundedString(suggestion.rationale, 700),
        );
      },
    },
    {
      id: 'code-format',
      workerEnforced: true,
      run(value) {
        return value.suggestions.every(
          (suggestion) =>
            typeof suggestion.code === 'string' &&
            /^\d{4}\.\d{2}$/.test(suggestion.code.trim()),
        );
      },
    },
    {
      id: 'code-in-catalog',
      workerEnforced: true,
      run(value) {
        return value.suggestions.every((suggestion) =>
          Object.hasOwn(
            EVAL_TOP_CODE_CATALOG,
            String(suggestion.code).trim(),
          ),
        );
      },
    },
    {
      id: 'title-matches-catalog',
      workerEnforced: true,
      run(value) {
        return value.suggestions.every(
          (suggestion) =>
            typeof suggestion.title === 'string' &&
            suggestion.title.trim() ===
              EVAL_TOP_CODE_CATALOG[String(suggestion.code).trim()],
        );
      },
    },
    {
      id: 'confidence-in-range',
      workerEnforced: true,
      run(value) {
        return value.suggestions.every(
          (suggestion) =>
            typeof suggestion.confidence === 'number' &&
            Number.isFinite(suggestion.confidence) &&
            suggestion.confidence >= 0 &&
            suggestion.confidence <= 1,
        );
      },
    },
    {
      id: 'unique-codes',
      workerEnforced: true,
      run(value) {
        const codes = value.suggestions.map((suggestion) =>
          String(suggestion.code),
        );
        return uniqueIgnoringCase(codes);
      },
    },
    {
      id: 'relevant-suggestion',
      workerEnforced: false,
      run(value) {
        return value.suggestions.some((suggestion) =>
          RELEVANT_TOP_CODES.includes(String(suggestion.code).trim()),
        );
      },
    },
  ],
};

const PROGRAM_NARRATIVE_FIXTURE = {
  task: 'program-narrative',
  kind: 'structured',
  maxTokens: 900,
  messages: [
    {
      role: 'system',
      content:
        'Draft the requested California community college program narrative sections only from supplied facts. Do not invent labor-market evidence, advisory approval, enrollment projections, transfer articulation, or regulatory findings. If no labor-market evidence was supplied, return an empty laborMarketAnalysis string. Return only the required JSON object.',
    },
    {
      role: 'user',
      content:
        'Program: Curriculum Workflow Fundamentals, Certificate of Achievement, 18 units. Courses: TEST 100 Curriculum Workflow Fundamentals; TEST 110 Outcomes and Assessment; TEST 120 Curriculum Review Practicum. No labor-market evidence has been supplied.',
    },
  ],
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      goalsAndObjectives: {
        type: 'string',
        minLength: 1,
        maxLength: 3000,
      },
      catalogDescription: {
        type: 'string',
        minLength: 1,
        maxLength: 2000,
      },
      requirementsJustification: {
        type: 'string',
        minLength: 1,
        maxLength: 3000,
      },
      laborMarketAnalysis: {
        type: 'string',
        maxLength: 3000,
      },
    },
    required: [
      'goalsAndObjectives',
      'catalogDescription',
      'requirementsJustification',
      'laborMarketAnalysis',
    ],
  },
  checks: [
    {
      id: 'exact-keys',
      workerEnforced: true,
      run(value) {
        return (
          hasExactKeys(value, [
            'goalsAndObjectives',
            'catalogDescription',
            'requirementsJustification',
            'laborMarketAnalysis',
          ]) &&
          isBoundedString(value.goalsAndObjectives, 3000) &&
          isBoundedString(value.catalogDescription, 2000) &&
          isBoundedString(value.requirementsJustification, 3000) &&
          isBoundedString(value.laborMarketAnalysis, 3000, true)
        );
      },
    },
    {
      id: 'no-invented-labor-market',
      workerEnforced: false,
      run(value) {
        return String(value.laborMarketAnalysis ?? '').trim() === '';
      },
    },
    {
      id: 'no-invented-approval',
      workerEnforced: false,
      run(value) {
        return ![
          value.goalsAndObjectives,
          value.catalogDescription,
          value.requirementsJustification,
        ].some((section) => APPROVAL_CLAIM_PATTERN.test(String(section ?? '')));
      },
    },
  ],
};

const COMPLIANCE_EXPLANATION_FIXTURE = {
  task: 'compliance-explanation',
  kind: 'structured',
  maxTokens: 900,
  messages: [
    {
      role: 'system',
      content: [
        'Explain possible California community college curriculum compliance issues from the supplied data, but do not make an approval decision or give legal advice.',
        'Use only the server-owned source summaries below. Cite them by their bracketed source ID. Do not cite any URL, authority, regulation, handbook, or source ID that is not in this pack.',
        'humanReviewRequired must always be true.',
        'Return only the required JSON object.',
        '',
        'SERVER-OWNED COMPLIANCE SOURCE PACK',
        complianceSourcePackPrompt(),
      ].join('\n'),
    },
    {
      role: 'user',
      content:
        'Course: TEST 100, Curriculum Workflow Fundamentals. 3 units, 54 total contact hours, 18-week semester. Explain whether the unit-to-hour relationship is consistent with the credit-hour standard, and cite the pack.',
    },
  ],
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      explanation: {
        type: 'string',
        minLength: 1,
        maxLength: 3000,
      },
      recommendations: {
        type: 'array',
        minItems: 1,
        maxItems: 8,
        items: {
          type: 'string',
          minLength: 1,
          maxLength: 600,
        },
      },
      citations: {
        type: 'array',
        minItems: 1,
        maxItems: 8,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sourceId: {
              type: 'string',
              enum: COMPLIANCE_SOURCE_IDS,
            },
            supports: {
              type: 'string',
              minLength: 1,
              maxLength: 500,
            },
          },
          required: ['sourceId', 'supports'],
        },
      },
      humanReviewRequired: {
        type: 'boolean',
        const: true,
      },
    },
    required: [
      'explanation',
      'recommendations',
      'citations',
      'humanReviewRequired',
    ],
  },
  checks: [
    {
      id: 'exact-keys',
      workerEnforced: true,
      run(value) {
        return hasExactKeys(value, [
          'explanation',
          'recommendations',
          'citations',
          'humanReviewRequired',
        ]);
      },
    },
    {
      id: 'human-review-required',
      workerEnforced: true,
      run(value) {
        return value.humanReviewRequired === true;
      },
    },
    {
      id: 'explanation-non-empty',
      workerEnforced: true,
      run(value) {
        return isBoundedString(value.explanation, 3000);
      },
    },
    {
      id: 'recommendations-1-to-8',
      workerEnforced: true,
      run(value) {
        return (
          Array.isArray(value.recommendations) &&
          value.recommendations.length >= 1 &&
          value.recommendations.length <= 8 &&
          value.recommendations.every((entry) => isBoundedString(entry, 600))
        );
      },
    },
    {
      id: 'citations-1-to-8',
      workerEnforced: true,
      run(value) {
        return (
          Array.isArray(value.citations) &&
          value.citations.length >= 1 &&
          value.citations.length <= 8
        );
      },
    },
    {
      id: 'citation-keys-exact',
      workerEnforced: true,
      run(value) {
        return value.citations.every(
          (citation) =>
            hasExactKeys(citation, ['sourceId', 'supports']) &&
            isBoundedString(citation.sourceId, 80) &&
            isBoundedString(citation.supports, 500),
        );
      },
    },
    {
      id: 'citations-sourceid-in-pack',
      workerEnforced: true,
      run(value) {
        return value.citations.every((citation) =>
          Object.hasOwn(
            EVAL_COMPLIANCE_SOURCE_PACK,
            String(citation.sourceId).trim(),
          ),
        );
      },
    },
  ],
};

export const EVAL_FIXTURES = Object.freeze([
  CHAT_FIXTURE,
  CATALOG_DESCRIPTION_FIXTURE,
  SLOS_FIXTURE,
  CONTENT_OUTLINE_FIXTURE,
  TOP_CODE_FIXTURE,
  PROGRAM_NARRATIVE_FIXTURE,
  COMPLIANCE_EXPLANATION_FIXTURE,
]);

export function fixtureForTask(task) {
  const fixture = EVAL_FIXTURES.find((entry) => entry.task === task);
  if (!fixture) throw new Error(`Unknown evaluation task: ${task}`);
  return fixture;
}

export function scoreFixture(fixture, content) {
  const value =
    fixture.kind === 'structured'
      ? parseJson(content)
      : String(content ?? '').trim();
  if (fixture.kind === 'structured' && !isRecord(value)) {
    return {
      passed: false,
      checks: fixture.checks.map((check) => ({
        id: check.id,
        workerEnforced: check.workerEnforced,
        passed: false,
      })),
    };
  }
  const checks = fixture.checks.map((check) => {
    let passed = false;
    try {
      passed = check.run(value, fixture) === true;
    } catch {
      passed = false;
    }
    return { id: check.id, workerEnforced: check.workerEnforced, passed };
  });
  return { passed: checks.every((check) => check.passed), checks };
}

/**
 * The subset of the rubric that `worker/index.ts` also enforces. This is what
 * `tests/worker/ai-eval-parity.test.ts` compares against a real `handleRequest`
 * verdict; the rubric-only checks are intentionally stricter and would make
 * that comparison fail by construction.
 */
export function workerEnforcedVerdict(fixture, content) {
  return scoreFixture(fixture, content)
    .checks.filter((check) => check.workerEnforced)
    .every((check) => check.passed);
}
