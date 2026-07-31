import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDemoFixture } from "@/lib/domain";
import type { CourseAggregate, ProgramAggregate } from "@/lib/domain";

import {
  useActivePersona,
  useCourse,
  useCourses,
  useDashboard,
  useNotifications,
  usePersonas,
  useProgram,
  usePrograms,
  useReferences,
  useRepositoryQuery,
  useRepositoryReady,
  useRepositoryRevision,
} from "./hooks";
import { curriculumRepository } from "./repository";

describe("repository live query hooks", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads, refreshes, and exposes query failures", async () => {
    const query = vi.fn<() => Promise<number>>().mockResolvedValueOnce(1);
    const result = renderHook(() => useRepositoryQuery(query, [], 0));
    await waitFor(() => expect(result.result.current.data).toBe(1));
    query.mockResolvedValueOnce(2);
    act(() => result.result.current.refresh());
    await waitFor(() => expect(result.result.current.data).toBe(2));

    query.mockRejectedValueOnce(new Error("query failed"));
    act(() => result.result.current.refresh());
    await waitFor(() => expect(result.result.current.error?.message).toBe("query failed"));
  });

  it("binds every public query hook to repository methods", async () => {
    const fixture = createDemoFixture("2026-07-30T20:00:00.000Z");
    const emptyPage = { items: [], total: 0, page: 1, pageSize: 25, pageCount: 0 };
    vi.spyOn(curriculumRepository, "initialize").mockResolvedValue({
      seeded: false,
      migrated: false,
      schemaVersion: 1,
      seedVersion: fixture.meta.seedVersion,
    });
    vi.spyOn(curriculumRepository, "listCourses").mockResolvedValue({
      ...emptyPage,
      items: [fixture.courses[0]],
      total: 1,
      pageCount: 1,
    });
    vi.spyOn(curriculumRepository, "getCourse").mockResolvedValue(null);
    vi.spyOn(curriculumRepository, "listPrograms").mockResolvedValue({
      ...emptyPage,
      items: [fixture.programs[0]],
      total: 1,
      pageCount: 1,
    });
    vi.spyOn(curriculumRepository, "getProgram").mockResolvedValue(null);
    vi.spyOn(curriculumRepository, "listNotifications").mockResolvedValue(emptyPage);
    vi.spyOn(curriculumRepository, "getDashboard").mockResolvedValue({
      myDrafts: 0,
      pendingReview: 0,
      recentlyApproved: 0,
      unreadNotifications: 0,
      coursesByStatus: [],
      recentActivity: [],
    });
    vi.spyOn(curriculumRepository, "getReferences").mockResolvedValue({
      divisions: fixture.divisions,
      departments: fixture.departments,
      topCodes: fixture.topCodes,
      ccnStandards: fixture.ccnStandards,
    });
    vi.spyOn(curriculumRepository, "listPersonas").mockResolvedValue(fixture.actors);
    vi.spyOn(curriculumRepository, "getActivePersona").mockResolvedValue(fixture.actors[0]);

    const result = renderHook(() => ({
      ready: useRepositoryReady(),
      courses: useCourses({ search: "MATH" }),
      course: useCourse(null),
      programs: usePrograms({ search: "Science" }),
      program: useProgram(null),
      notifications: useNotifications({ unreadOnly: true }),
      dashboard: useDashboard(fixture.actors[0].id),
      references: useReferences(),
      personas: usePersonas(),
      activePersona: useActivePersona(),
      revision: useRepositoryRevision(),
    }));
    await waitFor(() => expect(result.result.current.ready.loading).toBe(false));
    await waitFor(() => expect(result.result.current.activePersona.loading).toBe(false));
    expect(result.result.current.courses.data.items[0]).toEqual(fixture.courses[0]);
    expect(result.result.current.course.data).toBeNull();
    expect(result.result.current.programs.data.items[0]).toEqual(fixture.programs[0]);
    expect(result.result.current.program.data).toBeNull();
    expect(result.result.current.references.data?.departments).toHaveLength(17);
    expect(result.result.current.personas.data).toHaveLength(4);
    expect(result.result.current.revision).toBeGreaterThanOrEqual(0);
  });

  it("does not expose stale course or program data while a changed ID is loading", async () => {
    const fixture = createDemoFixture("2026-07-30T20:00:00.000Z");
    const firstCourse = {
      course: fixture.courses[0],
    } as unknown as CourseAggregate;
    const secondCourse = {
      course: fixture.courses[1],
    } as unknown as CourseAggregate;
    const firstProgram = {
      program: fixture.programs[0],
    } as unknown as ProgramAggregate;
    const secondProgram = {
      program: fixture.programs[1],
    } as unknown as ProgramAggregate;

    let resolveSecondCourse: ((value: CourseAggregate) => void) | undefined;
    let resolveSecondProgram: ((value: ProgramAggregate) => void) | undefined;
    vi.spyOn(curriculumRepository, "getCourse").mockImplementation((id) => {
      if (id === firstCourse.course.id) return Promise.resolve(firstCourse);
      return new Promise((resolve) => {
        resolveSecondCourse = resolve;
      });
    });
    vi.spyOn(curriculumRepository, "getProgram").mockImplementation((id) => {
      if (id === firstProgram.program.id) return Promise.resolve(firstProgram);
      return new Promise((resolve) => {
        resolveSecondProgram = resolve;
      });
    });

    const result = renderHook(
      ({ courseId, programId }) => ({
        course: useCourse(courseId),
        program: useProgram(programId),
      }),
      {
        initialProps: {
          courseId: firstCourse.course.id,
          programId: firstProgram.program.id,
        },
      },
    );
    await waitFor(() => expect(result.result.current.course.data).toBe(firstCourse));
    await waitFor(() => expect(result.result.current.program.data).toBe(firstProgram));

    result.rerender({
      courseId: secondCourse.course.id,
      programId: secondProgram.program.id,
    });
    expect(result.result.current.course).toMatchObject({ data: null, loading: true });
    expect(result.result.current.program).toMatchObject({ data: null, loading: true });

    act(() => {
      resolveSecondCourse?.(secondCourse);
      resolveSecondProgram?.(secondProgram);
    });
    await waitFor(() => expect(result.result.current.course.data).toBe(secondCourse));
    await waitFor(() => expect(result.result.current.program.data).toBe(secondProgram));
  });
});
