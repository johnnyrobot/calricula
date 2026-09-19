import { describe, expect, it } from 'vitest';
import type { CourseAggregate } from '@/lib/domain';
import type { ComplianceAudit } from '@/lib/compliance';
import {
  aggregateToView,
  auditToView,
  courseRecordToView,
  editorPatchToCourseUpdate,
} from './adapters';

const courseRecord = {
  id: 'course-1',
  lineageId: 'lineage-1',
  subjectCode: 'ENGL',
  courseNumber: '101',
  title: 'College Composition',
  catalogDescription: 'Academic reading and writing.',
  units: '3',
  minimumUnits: '3',
  maximumUnits: '3',
  lectureHours: '3',
  labHours: '0',
  activityHours: '0',
  tbaHours: '0',
  outsideOfClassHours: '6',
  totalStudentLearningHours: '162',
  topCode: '1501.00',
  status: 'Draft',
  version: 1,
  effectiveTerm: 'Fall 2027',
  ccnCode: null,
  cId: null,
  cbCodes: {},
  transferability: {},
  geApplicability: {},
  lmiData: null,
  departmentId: 'department-1',
  createdBy: 'actor-1',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-29T00:00:00.000Z',
  approvedAt: null,
} as const;

describe('course adapters', () => {
  it('maps a repository aggregate into a sorted, reviewer-ready view', () => {
    const aggregate = {
      course: courseRecord,
      slos: [
        {
          id: 'slo-2',
          courseId: 'course-1',
          sequence: 2,
          outcomeText: 'Revise prose.',
          bloomLevel: 'Evaluate',
          performanceCriteria: null,
          createdAt: courseRecord.createdAt,
          updatedAt: courseRecord.updatedAt,
        },
        {
          id: 'slo-1',
          courseId: 'course-1',
          sequence: 1,
          outcomeText: 'Compose arguments.',
          bloomLevel: 'Create',
          performanceCriteria: 'Uses evidence.',
          createdAt: courseRecord.createdAt,
          updatedAt: courseRecord.updatedAt,
        },
      ],
      content: [
        {
          id: 'content-1',
          courseId: 'course-1',
          sequence: 1,
          topic: 'Argument',
          subtopics: ['Claims'],
          hoursAllocated: '18',
          linkedSloIds: ['slo-1'],
          createdAt: courseRecord.createdAt,
          updatedAt: courseRecord.updatedAt,
        },
      ],
      requisites: [
        {
          id: 'requisite-1',
          courseId: 'course-1',
          type: 'Prerequisite',
          validationType: 'Content Review',
          requisiteCourseId: 'linked-course',
          requisiteText: null,
          contentReview: 'Documented entry skills.',
          createdAt: courseRecord.createdAt,
          updatedAt: courseRecord.updatedAt,
        },
      ],
      comments: [],
      history: [],
      ccnJustification: {
        id: 'justification-1',
        courseId: 'course-1',
        ccnCode: 'ENGL C1000',
        justification: 'The local course has a distinct vocational emphasis.',
        evidence: [],
        createdBy: 'actor-1',
        createdAt: courseRecord.createdAt,
        updatedAt: courseRecord.updatedAt,
      },
    } as unknown as CourseAggregate;

    const view = aggregateToView(aggregate, {
      departments: [
        {
          id: 'department-1',
          divisionId: 'division-1',
          code: 'ENGL',
          name: 'English',
          createdAt: courseRecord.createdAt,
          updatedAt: courseRecord.updatedAt,
        },
      ],
      courses: [
        {
          ...courseRecord,
          id: 'linked-course',
          subjectCode: 'ENGL',
          courseNumber: '100',
          title: 'Academic Literacy',
        },
      ],
    });

    expect(view.departmentName).toBe('English');
    expect(view.slos.map((slo) => slo.id)).toEqual(['slo-1', 'slo-2']);
    expect(view.contentItems[0]).toMatchObject({
      hours: '18',
      linkedSloIds: ['slo-1'],
    });
    expect(view.requisites[0]).toMatchObject({
      courseCode: 'ENGL 100',
      courseTitle: 'Academic Literacy',
    });
    expect(view.ccnDisposition).toBe('non-match');
    expect(view.ccnJustification).toContain('distinct vocational emphasis');
  });

  it('uses a helpful department fallback for an unmapped record', () => {
    expect(
      courseRecordToView(courseRecord, []).departmentName,
    ).toBe('Department pending');
  });

  it('converts empty optional editor values to repository nulls', () => {
    expect(
      editorPatchToCourseUpdate({
        title: 'Revised title',
        catalogDescription: '',
        effectiveTerm: '',
        topCode: '',
        ccnCode: '',
        outsideHours: '6',
      }),
    ).toEqual({
      title: 'Revised title',
      catalogDescription: null,
      outsideOfClassHours: '6',
      effectiveTerm: null,
      topCode: null,
      ccnCode: null,
    });
  });

  it('preserves deterministic audit counts and citations', () => {
    const audit = {
      overallStatus: 'warn',
      complianceScore: 80,
      totalChecks: 1,
      passed: 0,
      failed: 0,
      warnings: 1,
      calculatedHours: {},
      results: [
        {
          ruleId: 'hours',
          ruleName: 'Hours and units',
          category: 'Units & Hours',
          status: 'warn',
          message: 'Review the conventional relationship.',
          section: 'Basic information',
          citation: 'Title 5 § 55002.5',
          recommendation: 'Confirm the local calculation.',
        },
      ],
    } as unknown as ComplianceAudit;

    expect(auditToView(audit)).toMatchObject({
      overallStatus: 'warn',
      complianceScore: 80,
      warnings: 1,
      results: [
        {
          ruleId: 'hours',
          citation: 'Title 5 § 55002.5',
        },
      ],
    });
  });
});
