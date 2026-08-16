import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CourseAggregate } from '@/lib/domain';
import {
  CCNSection,
  ContentSection,
  OverviewSection,
  SLOSection,
} from './CourseEditorSections';
import type { CourseViewModel } from './types';

vi.mock('@/components/ai/CourseAIControls', () => ({
  CourseAIControls: ({
    task,
    onApply,
  }: {
    task: string;
    onApply: (value: unknown) => void;
  }) => (
    <button
      type="button"
      onClick={() => {
        if (task === 'slos') onApply(['Evaluate evidence in a scholarly argument.']);
        if (task === 'top-code') onApply({ topCode: '9999.99' });
      }}
    >
      Apply {task} test suggestion
    </button>
  ),
}));

function course(): CourseViewModel {
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
        id: 'persisted-slo-1',
        sequence: 1,
        outcomeText: 'Compose a documented academic argument.',
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
        linkedSloIds: ['persisted-slo-1'],
      },
    ],
    requisites: [],
    comments: [],
    history: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
  };
}

function aggregate(value: CourseViewModel) {
  return { course: value } as unknown as CourseAggregate;
}

describe('CourseEditorSections', () => {
  it('removes deleted SLO IDs from every linked content item', () => {
    const value = course();
    const onChange = vi.fn();
    render(
      <SLOSection
        course={value}
        aggregate={aggregate(value)}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete outcome 1' }));

    expect(onChange).toHaveBeenCalledWith({
      slos: [],
      contentItems: [
        expect.objectContaining({
          id: 'content-1',
          linkedSloIds: [],
        }),
      ],
    });
  });

  it('clears old content links when an AI suggestion replaces the SLO set', () => {
    const value = course();
    const onChange = vi.fn();
    render(
      <SLOSection
        course={value}
        aggregate={aggregate(value)}
        onChange={onChange}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Apply slos test suggestion' }),
    );

    const patch = onChange.mock.calls[0][0];
    expect(patch.slos).toEqual([
      expect.objectContaining({
        outcomeText: 'Evaluate evidence in a scholarly argument.',
      }),
    ]);
    expect(patch.contentItems).toEqual([
      expect.objectContaining({ linkedSloIds: [] }),
    ]);
  });

  it('preserves a trailing newline while a user types multiline subtopics', () => {
    const value = course();
    const onChange = vi.fn();
    render(
      <ContentSection
        course={value}
        aggregate={aggregate(value)}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Subtopics/), {
      target: { value: 'Claims\n' },
    });

    expect(onChange).toHaveBeenCalledWith({
      contentItems: [
        expect.objectContaining({
          id: 'content-1',
          subtopics: ['Claims', ''],
        }),
      ],
    });
  });

  it('limits TOP-code selection to local references and rejects an unavailable AI suggestion', () => {
    const value = course();
    const onChange = vi.fn();
    render(
      <CCNSection
        course={value}
        aggregate={aggregate(value)}
        matches={[]}
        topCodes={[
          {
            id: '33333333-3333-4333-8333-333333333333',
            code: '1501.00',
            title: 'English',
            vocational: false,
            parentCode: null,
          },
        ]}
        onChange={onChange}
      />,
    );

    expect(screen.getByLabelText('TOP code')).toHaveValue('1501.00');
    expect(
      screen.getByRole('option', { name: '1501.00 — English' }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Apply top-code test suggestion',
      }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      "9999.99, which is not in this demo's local TOP-code reference set",
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not put an unavailable CCN-implied TOP code into editor state', () => {
    const value = course();
    const onChange = vi.fn();
    render(
      <CCNSection
        course={value}
        aggregate={aggregate(value)}
        matches={[
          {
            standardId: 'standard-1',
            ccnCode: 'COMM C1000',
            title: 'Introduction to Public Speaking',
            minimumUnits: '3',
            confidenceScore: 0.92,
            matchReasons: ['Same discipline'],
            impliedTopCode: '0604.00',
          },
        ]}
        topCodes={[
          {
            id: '33333333-3333-4333-8333-333333333333',
            code: '1501.00',
            title: 'English',
            vocational: false,
            parentCode: null,
          },
        ]}
        onChange={onChange}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /Adopt selected standard/ }),
    );

    expect(onChange).toHaveBeenCalledWith({
      ccnDisposition: 'adopted',
      ccnCode: 'COMM C1000',
      ccnJustification: '',
    });
  });

  it('applies a CCN-implied TOP code when the exact local reference exists', () => {
    const value = course();
    const onChange = vi.fn();
    render(
      <CCNSection
        course={value}
        aggregate={aggregate(value)}
        matches={[
          {
            standardId: 'standard-1',
            ccnCode: 'ENGL C1000',
            title: 'Academic Reading and Writing',
            minimumUnits: '3',
            confidenceScore: 0.95,
            matchReasons: ['Same discipline'],
            impliedTopCode: '1501.00',
          },
        ]}
        topCodes={[
          {
            id: '33333333-3333-4333-8333-333333333333',
            code: '1501.00',
            title: 'English',
            vocational: false,
            parentCode: null,
          },
        ]}
        onChange={onChange}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /Adopt selected standard/ }),
    );

    expect(onChange).toHaveBeenCalledWith({
      ccnDisposition: 'adopted',
      ccnCode: 'ENGL C1000',
      ccnJustification: '',
      topCode: '1501.00',
    });
  });

  it('presents the conventional 54-hour figure as a reference, not a verdict', () => {
    const value = course();
    render(
      <OverviewSection
        course={value}
        aggregate={aggregate(value)}
        departments={[
          {
            id: 'department-1',
            divisionId: 'division-1',
            code: 'ENGL',
            name: 'English',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ]}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        /162\.0 total student hours ÷ 54 = 3\.00 conventional units/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/not the Title 5 minimum/i)).toBeInTheDocument();

    // Title 5 compliance is the 48-hour minimum, reported by the audit in
    // Section VI. 54 is a district convention and must never be rendered as a
    // pass/fail verdict here. See ADR-0003.
    expect(screen.queryByText(/relationship satisfied/i)).toBeNull();
    expect(screen.queryByText(/Review the unit\/hour relationship/i)).toBeNull();
  });
});
