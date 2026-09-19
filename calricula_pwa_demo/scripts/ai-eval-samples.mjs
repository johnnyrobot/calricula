/**
 * Canned model output per task: one sample the rubric and the Worker both
 * accept, and one they both reject.
 *
 * Shared deliberately. `scripts/ai-evaluate.test.mjs` uses `good` as the
 * stubbed upstream response, and `tests/worker/ai-eval-parity.test.ts` pushes
 * both variants through the real `handleRequest`. Keeping one copy is the point
 * — a "good" sample the evaluator treats as passing must be one the Worker
 * actually accepts.
 *
 * Each `bad` sample must break a check tagged `workerEnforced: true` in
 * `ai-eval-fixtures.mjs`. Breaking a rubric-only check would make the parity
 * comparison fail by construction, because the Worker does not enforce those.
 */

const GOOD_CHAT =
  'Measurable course outcomes give faculty shared evidence for consistent and transparent curriculum review decisions.';

const GOOD_CATALOG_DESCRIPTION =
  'Curriculum Workflow Fundamentals introduces the course outline of record and the local curriculum review workflow. Students examine how measurable outcomes, sequenced topics, and contact hours fit together, then practise routing a proposal through departmental and committee review. The course suits faculty who are new to curriculum work.';

export const EVAL_SAMPLES = Object.freeze({
  chat: Object.freeze({
    good: GOOD_CHAT,
    // The Worker rejects empty chat content outright.
    bad: '   ',
  }),
  'catalog-description': Object.freeze({
    good: JSON.stringify({ description: GOOD_CATALOG_DESCRIPTION }),
    // Extra top-level key: assertExactKeys rejects it.
    bad: JSON.stringify({
      description: GOOD_CATALOG_DESCRIPTION,
      note: 'An unexpected field.',
    }),
  }),
  slos: Object.freeze({
    good: JSON.stringify({
      slos: [
        'Analyze a course outline of record for alignment between outcomes and content.',
        'Evaluate a proposed curriculum change against local review criteria.',
      ],
    }),
    // Duplicate ignoring case: requireUniqueStrings rejects it.
    bad: JSON.stringify({
      slos: [
        'Analyze a course outline of record for alignment between outcomes and content.',
        'ANALYZE A COURSE OUTLINE OF RECORD FOR ALIGNMENT BETWEEN OUTCOMES AND CONTENT.',
      ],
    }),
  }),
  'content-outline': Object.freeze({
    good: JSON.stringify({
      topics: [
        {
          sequence: 1,
          topic: 'Foundations of the course outline of record',
          contactHours: 27,
          relatedSloNumbers: [1],
        },
        {
          sequence: 2,
          topic: 'Evaluating a proposed curriculum change',
          contactHours: 27,
          relatedSloNumbers: [2],
        },
      ],
    }),
    // Hours sum to 47, not the supplied 54.
    bad: JSON.stringify({
      topics: [
        {
          sequence: 1,
          topic: 'Foundations of the course outline of record',
          contactHours: 27,
          relatedSloNumbers: [1],
        },
        {
          sequence: 2,
          topic: 'Evaluating a proposed curriculum change',
          contactHours: 20,
          relatedSloNumbers: [2],
        },
      ],
    }),
  }),
  'top-code': Object.freeze({
    good: JSON.stringify({
      suggestions: [
        {
          code: '0707.00',
          title: 'Computer Information Systems',
          rationale:
            'The course covers introductory programming, data types, and control flow.',
          confidence: 0.82,
        },
      ],
    }),
    // Title does not match the server-owned catalog for this code.
    bad: JSON.stringify({
      suggestions: [
        {
          code: '0707.00',
          title: 'Computer Science',
          rationale:
            'The course covers introductory programming, data types, and control flow.',
          confidence: 0.82,
        },
      ],
    }),
  }),
  'program-narrative': Object.freeze({
    good: JSON.stringify({
      goalsAndObjectives:
        'Prepare faculty to draft, sequence, and route curriculum through local review.',
      catalogDescription:
        'A three-course certificate covering outlines of record, outcomes, and review practice.',
      requirementsJustification:
        'The three courses build sequentially from drafting to assessment to practicum.',
      laborMarketAnalysis: '',
    }),
    // Empty required section: requireString rejects it.
    bad: JSON.stringify({
      goalsAndObjectives: '',
      catalogDescription:
        'A three-course certificate covering outlines of record, outcomes, and review practice.',
      requirementsJustification:
        'The three courses build sequentially from drafting to assessment to practicum.',
      laborMarketAnalysis: '',
    }),
  }),
  'compliance-explanation': Object.freeze({
    good: JSON.stringify({
      explanation:
        'Three units at 54 total contact hours is consistent with the conventional 18 hours per unit used for a lecture course.',
      recommendations: [
        'Confirm the total student work hours with the department before submission.',
      ],
      citations: [
        {
          sourceId: 'title5-credit-hour',
          supports:
            'Establishes the minimum total student work behind one unit of credit.',
        },
      ],
      humanReviewRequired: true,
    }),
    // Cites a source outside the server-owned pack.
    bad: JSON.stringify({
      explanation:
        'Three units at 54 total contact hours is consistent with the conventional 18 hours per unit used for a lecture course.',
      recommendations: [
        'Confirm the total student work hours with the department before submission.',
      ],
      citations: [
        {
          sourceId: 'education-code-70901',
          supports: 'Invented supporting statement.',
        },
      ],
      humanReviewRequired: true,
    }),
  }),
});

export function sampleForTask(task) {
  const sample = EVAL_SAMPLES[task];
  if (!sample) throw new Error(`Unknown evaluation task: ${task}`);
  return sample;
}
