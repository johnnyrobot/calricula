import { describe, expect, it } from 'vitest';
import type { CCNStandard, TopCode } from '@/lib/domain';
import { planCourseSave } from './course-save';
import type { CourseViewModel } from './types';

const TOP_CODES: TopCode[] = [
  {
    id: 'top-1',
    code: '1501.00',
    title: 'English',
    vocational: false,
    parentCode: null,
  },
];

function view(overrides: Partial<CourseViewModel> = {}): CourseViewModel {
  return {
    id: 'course-1',
    subjectCode: 'ENGL',
    courseNumber: '101',
    title: 'College Composition',
    departmentId: 'department-1',
    departmentName: 'English',
    catalogDescription: 'Academic reading and writing.',
    units: '3',
    lectureHours: '3',
    labHours: '0',
    activityHours: '0',
    tbaHours: '0',
    outsideHours: '6',
    totalStudentHours: '162',
    status: 'Draft',
    version: 1,
    effectiveTerm: 'Fall 2027',
    topCode: '1501.00',
    cId: '',
    ccnCode: '',
    ccnCandidateCode: '',
    ccnDisposition: 'unreviewed',
    ccnJustification: '',
    slos: [
      {
        id: 'slo-1',
        sequence: 1,
        outcomeText: 'Compose a documented argument.',
        bloomLevel: 'Create',
      },
    ],
    contentItems: [
      {
        id: 'content-1',
        sequence: 1,
        topic: 'Evidence and argument',
        subtopics: ['Claims'],
        hours: '18',
        linkedSloIds: ['slo-1'],
      },
    ],
    requisites: [],
    comments: [],
    history: [],
    createdAt: '2026-07-29T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
    ...overrides,
  } as CourseViewModel;
}

/**
 * planCCNAdoption reads its inputs structurally, so a standard only needs the
 * fields the adoption plan actually consults. impliedTopCode is the one that
 * drives the CB03 reconciliation under test.
 */
function standard(impliedTopCode: string): CCNStandard {
  return {
    id: 'ccn-1',
    ccnCode: 'ENGL C1000',
    discipline: 'ENGL',
    subjectCode: 'ENGL',
    courseNumber: 'C1000',
    title: 'College Composition',
    impliedTopCode,
    impliedCb05: 'A',
  } as unknown as CCNStandard;
}

function context(overrides: Partial<{ ccnStandards: CCNStandard[] }> = {}) {
  return {
    course: { id: 'course-1', units: '3', cbCodes: {} } as unknown as never,
    topCodes: TOP_CODES,
    ccnStandards: [] as CCNStandard[],
    ...overrides,
  };
}

describe('planCourseSave', () => {
  it('projects a clean draft into one atomic save command', () => {
    const plan = planCourseSave(view(), context());

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    // The adapter renames on the way out: the editor's outsideHours and
    // totalStudentHours become the domain's outsideOfClassHours and
    // totalStudentLearningHours.
    expect(plan.command.course).toMatchObject({
      title: 'College Composition',
      units: '3',
      outsideOfClassHours: '6',
      totalStudentLearningHours: '162',
      topCode: '1501.00',
    });
    expect(plan.command.slos).toEqual([
      expect.objectContaining({
        clientId: 'slo-1',
        sequence: 1,
        outcomeText: 'Compose a documented argument.',
        bloomLevel: 'Create',
      }),
    ]);
    expect(plan.command.content).toEqual([
      expect.objectContaining({
        sequence: 1,
        topic: 'Evidence and argument',
        subtopics: ['Claims'],
        linkedSloIds: ['slo-1'],
      }),
    ]);
    expect(plan.command.requisites).toEqual([]);
    expect(plan.command.ccnJustification).toBeNull();
  });

  it('sends a draft-only child as a client ID rather than a persisted ID', () => {
    const plan = planCourseSave(
      view({
        slos: [
          {
            id: 'tmp-1',
            sequence: 1,
            outcomeText: 'Evaluate a scholarly argument.',
            bloomLevel: 'Evaluate',
          },
        ],
        contentItems: [
          {
            id: 'tmp-2',
            sequence: 1,
            topic: 'Rhetoric',
            subtopics: [],
            hours: '9',
            linkedSloIds: ['tmp-1'],
          },
        ],
      }),
      context(),
    );

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    // A tmp- row has never been persisted, so naming an id would ask the
    // repository to update a record that does not exist.
    const [slo] = plan.command.slos ?? [];
    const [content] = plan.command.content ?? [];
    expect(slo).not.toHaveProperty('id');
    expect(slo).toMatchObject({ clientId: 'tmp-1' });
    expect(content).not.toHaveProperty('id');
    expect(content).toMatchObject({ linkedSloIds: ['tmp-1'] });
  });

  it('refuses a non-match rationale shorter than the required justification', () => {
    const plan = planCourseSave(
      view({
        ccnDisposition: 'non-match',
        ccnCandidateCode: 'ENGL C1000',
        ccnJustification: 'Too short.',
      }),
      context(),
    );

    expect(plan).toEqual({
      ok: false,
      issues: [
        'The CCN non-match justification must contain at least 40 characters.',
      ],
    });
  });

  it('refuses a non-match rationale that names no CCN candidate', () => {
    const plan = planCourseSave(
      view({
        ccnDisposition: 'non-match',
        ccnCandidateCode: '   ',
        ccnJustification:
          'This course diverges from the statewide descriptor in its assessment model.',
      }),
      context(),
    );

    expect(plan).toEqual({
      ok: false,
      issues: [
        'Select the CCN standard this course does not match before saving the justification.',
      ],
    });
  });

  it('carries a complete non-match rationale into the save command', () => {
    const justification =
      'This course diverges from the statewide descriptor in its assessment model.';
    const plan = planCourseSave(
      view({
        ccnDisposition: 'non-match',
        ccnCandidateCode: 'ENGL C1000',
        ccnJustification: `  ${justification}  `,
      }),
      context(),
    );

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.command.ccnJustification).toEqual({
      ccnCode: 'ENGL C1000',
      justification,
      evidence: [],
    });
  });

  it('refuses a TOP code that is not in the local reference set', () => {
    const plan = planCourseSave(view({ topCode: '9999.99' }), context());

    expect(plan).toEqual({
      ok: false,
      issues: [
        "Select a TOP code from this demo's 1-code reference list.",
      ],
    });
  });

  it('refuses a CCN standard absent from the demo reference set', () => {
    const plan = planCourseSave(
      view({ ccnDisposition: 'adopted', ccnCode: 'ENGL C9999' }),
      context({ ccnStandards: [standard('1501.00')] }),
    );

    expect(plan).toEqual({
      ok: false,
      issues: [
        'The selected CCN standard is not available in this demo reference set.',
      ],
    });
  });

  it('adopts a CCN-implied TOP code that the demo actually carries', () => {
    const plan = planCourseSave(
      view({ ccnDisposition: 'adopted', ccnCode: 'ENGL C1000' }),
      context({ ccnStandards: [standard('1501.00')] }),
    );

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.command.course).toMatchObject({
      ccnCode: 'ENGL C1000',
      topCode: '1501.00',
      cbCodes: { CB05: 'A', CB03: '1501.00' },
    });
  });

  it('keeps the local TOP code and drops CB03 when the CCN implies a code the demo lacks', () => {
    const plan = planCourseSave(
      view({ ccnDisposition: 'adopted', ccnCode: 'ENGL C1000' }),
      context({ ccnStandards: [standard('9999.99')] }),
    );

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    // CB03 must never name a TOP code this demo cannot offer, and the course's
    // own valid selection survives the adoption.
    expect(plan.command.course).toMatchObject({
      ccnCode: 'ENGL C1000',
      topCode: '1501.00',
      cbCodes: { CB05: 'A' },
    });
    expect(
      (plan.command.course as { cbCodes: Record<string, unknown> }).cbCodes,
    ).not.toHaveProperty('CB03');
  });
});
