import { describe, expect, it } from 'vitest';

import {
  EVAL_COMPLIANCE_SOURCE_PACK,
  EVAL_FIXTURES,
  EVAL_TOP_CODE_CATALOG,
  fixtureForTask,
  scoreFixture,
  workerEnforcedVerdict,
} from './ai-eval-fixtures.mjs';

function checkResult(fixture, content, id) {
  return scoreFixture(fixture, content).checks.find(
    (check) => check.id === id,
  );
}

const GOOD_OUTLINE = JSON.stringify({
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
});

const GOOD_COMPLIANCE = JSON.stringify({
  explanation: 'The unit calculation follows the Title 5 credit-hour formula.',
  recommendations: ['Confirm the total student work hours with the department.'],
  citations: [
    {
      sourceId: 'title5-credit-hour',
      supports: 'Establishes the minimum hours behind one unit of credit.',
    },
  ],
  humanReviewRequired: true,
});

describe('evaluation fixture registry', () => {
  it('covers every AI task route the Worker exposes, in route order', () => {
    expect(EVAL_FIXTURES.map((fixture) => fixture.task)).toEqual([
      'chat',
      'catalog-description',
      'slos',
      'content-outline',
      'top-code',
      'program-narrative',
      'compliance-explanation',
    ]);
  });

  it('gives every check a stable id and an explicit enforcement tag', () => {
    for (const fixture of EVAL_FIXTURES) {
      expect(fixture.checks.length).toBeGreaterThan(0);
      const ids = fixture.checks.map((check) => check.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const check of fixture.checks) {
        expect(typeof check.workerEnforced).toBe('boolean');
        expect(typeof check.run).toBe('function');
      }
      expect(
        fixture.checks.some((check) => check.workerEnforced),
      ).toBe(true);
    }
  });

  it('reports the rubric-only checks the Worker deliberately does not enforce', () => {
    const rubricOnly = EVAL_FIXTURES.flatMap((fixture) =>
      fixture.checks
        .filter((check) => !check.workerEnforced)
        .map((check) => `${fixture.task}/${check.id}`),
    );
    expect(rubricOnly).toEqual([
      'chat/single-paragraph',
      'chat/not-json',
      'chat/no-approval-claim',
      'catalog-description/word-count-25-120',
      'catalog-description/no-invented-prerequisite',
      'slos/action-verb-start',
      'content-outline/related-slos-supplied',
      'top-code/relevant-suggestion',
      'program-narrative/no-invented-labor-market',
      'program-narrative/no-invented-approval',
    ]);
  });

  it('rejects a content outline whose hours do not sum to the supplied total', () => {
    const fixture = fixtureForTask('content-outline');
    const bad = JSON.stringify({
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
    });
    expect(scoreFixture(fixture, GOOD_OUTLINE).passed).toBe(true);
    expect(scoreFixture(fixture, bad).passed).toBe(false);
    expect(checkResult(fixture, bad, 'hours-sum-exact')?.passed).toBe(false);
  });

  it('rejects a content outline whose sequence values are not consecutive', () => {
    const fixture = fixtureForTask('content-outline');
    const bad = JSON.stringify({
      topics: [
        {
          sequence: 1,
          topic: 'Foundations of the course outline of record',
          contactHours: 27,
          relatedSloNumbers: [1],
        },
        {
          sequence: 3,
          topic: 'Evaluating a proposed curriculum change',
          contactHours: 27,
          relatedSloNumbers: [2],
        },
      ],
    });
    expect(checkResult(fixture, bad, 'sequence-consecutive')?.passed).toBe(
      false,
    );
  });

  it('rejects a TOP code whose title does not match the server catalog', () => {
    const fixture = fixtureForTask('top-code');
    const bad = JSON.stringify({
      suggestions: [
        {
          code: '0707.00',
          title: 'Computer Science',
          rationale: 'Introductory programming content.',
          confidence: 0.8,
        },
      ],
    });
    expect(scoreFixture(fixture, bad).passed).toBe(false);
    expect(checkResult(fixture, bad, 'title-matches-catalog')?.passed).toBe(
      false,
    );
  });

  it('rejects a TOP code outside the server catalog', () => {
    const fixture = fixtureForTask('top-code');
    const bad = JSON.stringify({
      suggestions: [
        {
          code: '9999.00',
          title: 'Invented Discipline',
          rationale: 'Introductory programming content.',
          confidence: 0.8,
        },
      ],
    });
    expect(checkResult(fixture, bad, 'code-in-catalog')?.passed).toBe(false);
  });

  it('rejects an invented labor-market analysis when no evidence was supplied', () => {
    const fixture = fixtureForTask('program-narrative');
    const bad = JSON.stringify({
      goalsAndObjectives: 'Prepare students for entry-level roles.',
      catalogDescription: 'A synthetic demo program.',
      requirementsJustification: 'Courses build sequentially.',
      laborMarketAnalysis: 'Regional demand is projected to grow 14 percent.',
    });
    expect(
      checkResult(fixture, bad, 'no-invented-labor-market')?.passed,
    ).toBe(false);
    expect(checkResult(fixture, bad, 'exact-keys')?.passed).toBe(true);
  });

  it('rejects a citation outside the server-owned compliance pack', () => {
    const fixture = fixtureForTask('compliance-explanation');
    const bad = JSON.stringify({
      explanation: 'The unit calculation follows the standard formula.',
      recommendations: ['Confirm the hours with the department.'],
      citations: [
        {
          sourceId: 'education-code-70901',
          supports: 'Invented supporting statement.',
        },
      ],
      humanReviewRequired: true,
    });
    expect(scoreFixture(fixture, GOOD_COMPLIANCE).passed).toBe(true);
    expect(
      checkResult(fixture, bad, 'citations-sourceid-in-pack')?.passed,
    ).toBe(false);
  });

  it('rejects compliance output that does not require human review', () => {
    const fixture = fixtureForTask('compliance-explanation');
    const bad = JSON.stringify({
      explanation: 'The unit calculation follows the standard formula.',
      recommendations: ['Confirm the hours with the department.'],
      citations: [
        {
          sourceId: 'title5-credit-hour',
          supports: 'Establishes the minimum hours behind one unit of credit.',
        },
      ],
      humanReviewRequired: false,
    });
    expect(
      checkResult(fixture, bad, 'human-review-required')?.passed,
    ).toBe(false);
  });

  it('rejects duplicated student learning outcomes', () => {
    const fixture = fixtureForTask('slos');
    const bad = JSON.stringify({
      slos: [
        'Analyze a course outline of record for Title 5 compliance.',
        'analyze a course outline of record for title 5 compliance.',
      ],
    });
    expect(checkResult(fixture, bad, 'unique-outcomes')?.passed).toBe(false);
  });

  it('rejects a catalog description that invents a prerequisite', () => {
    const fixture = fixtureForTask('catalog-description');
    const bad = JSON.stringify({
      description:
        'This course introduces the course outline of record and the local curriculum review workflow. Prerequisite: TEST 050. Students practise drafting outcomes, sequencing topics, and routing a proposal through departmental and committee review before it reaches the governing board.',
    });
    expect(
      checkResult(fixture, bad, 'no-invented-prerequisite')?.passed,
    ).toBe(false);
    expect(checkResult(fixture, bad, 'exact-keys')?.passed).toBe(true);
  });

  it('rejects a chat reply that claims an approval', () => {
    const fixture = fixtureForTask('chat');
    const bad =
      'Measurable outcomes are approved for curriculum review because they give faculty shared evidence when they compare proposals across departments.';
    expect(checkResult(fixture, bad, 'no-approval-claim')?.passed).toBe(false);
    expect(checkResult(fixture, bad, 'non-empty')?.passed).toBe(true);
  });

  it('fails every check when structured content is not a JSON object', () => {
    const fixture = fixtureForTask('slos');
    const result = scoreFixture(fixture, 'not json at all');
    expect(result.passed).toBe(false);
    expect(result.checks.every((check) => !check.passed)).toBe(true);
    expect(result.checks.map((check) => check.id)).toEqual(
      fixture.checks.map((check) => check.id),
    );
  });

  it('separates the worker-enforced verdict from the full rubric verdict', () => {
    const fixture = fixtureForTask('program-narrative');
    const inventedLabourMarket = JSON.stringify({
      goalsAndObjectives: 'Prepare students for entry-level roles.',
      catalogDescription: 'A synthetic demo program.',
      requirementsJustification: 'Courses build sequentially.',
      laborMarketAnalysis: 'Regional demand is projected to grow 14 percent.',
    });
    // The Worker does not enforce this; the rubric deliberately does.
    expect(scoreFixture(fixture, inventedLabourMarket).passed).toBe(false);
    expect(workerEnforcedVerdict(fixture, inventedLabourMarket)).toBe(true);
  });

  it('publishes the catalogs every fixture suggestion must come from', () => {
    expect(Object.keys(EVAL_TOP_CODE_CATALOG).length).toBe(20);
    expect(EVAL_TOP_CODE_CATALOG['0707.00']).toBe(
      'Computer Information Systems',
    );
    expect(Object.keys(EVAL_COMPLIANCE_SOURCE_PACK)).toEqual([
      'title5-course-standards',
      'title5-credit-hour',
      'pcah-current-edition',
      'ccn-current-guidance',
    ]);
  });

  it('refuses an unknown task', () => {
    expect(() => fixtureForTask('not-a-task')).toThrow(
      'Unknown evaluation task: not-a-task',
    );
  });
});
