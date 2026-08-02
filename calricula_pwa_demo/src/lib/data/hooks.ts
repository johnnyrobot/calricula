"use client";

import {
  type DependencyList,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import type {
  CourseAggregate,
  CourseQuery,
  DashboardSummary,
  InitializationResult,
  NotificationQuery,
  PageResult,
  ProgramAggregate,
  ProgramQuery,
  ReferenceData,
} from "./contracts";
import type { Actor, Course, Notification, Program } from "@/lib/domain";
import { repositoryInvalidation } from "./invalidation";
import { curriculumRepository } from "./repository";

export interface RepositoryQueryState<T> {
  data: T;
  error: Error | null;
  loading: boolean;
  refresh: () => void;
}

// The bus the repository bumps is the one hooks read. Going through the
// repository only forwarded these calls to the same shared instance.
export function useRepositoryRevision(): number {
  return useSyncExternalStore(
    repositoryInvalidation.subscribe,
    repositoryInvalidation.getRevision,
    () => 0,
  );
}

export function useRepositoryQuery<T>(
  query: () => Promise<T>,
  dependencies: DependencyList,
  initialValue: T,
): RepositoryQueryState<T> {
  const revision = useRepositoryRevision();
  const [refreshToken, setRefreshToken] = useState(0);
  const [state, setState] = useState<Omit<RepositoryQueryState<T>, "refresh">>({
    data: initialValue,
    error: null,
    loading: true,
  });
  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    void query().then(
      (data) => {
        if (active) setState({ data, error: null, loading: false });
      },
      (error: unknown) => {
        if (active) {
          setState((current) => ({
            ...current,
            error: error instanceof Error ? error : new Error(String(error)),
            loading: false,
          }));
        }
      },
    );
    return () => {
      active = false;
    };
    // Callers define the query dependency boundary explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, refreshToken, ...dependencies]);

  return { ...state, refresh };
}

function emptyPage<T>(pageSize = 25): PageResult<T> {
  return { items: [], total: 0, page: 1, pageSize, pageCount: 0 };
}

function stableKey(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function useRepositoryReady(): RepositoryQueryState<InitializationResult | null> {
  const query = useCallback(() => curriculumRepository.initialize(), []);
  return useRepositoryQuery(query, [], null);
}

export function useCourses(query: CourseQuery = {}): RepositoryQueryState<PageResult<Course>> {
  const key = stableKey(query);
  const stableQuery = useMemo(() => JSON.parse(key) as CourseQuery, [key]);
  const load = useCallback(() => curriculumRepository.listCourses(stableQuery), [stableQuery]);
  return useRepositoryQuery(load, [key], emptyPage<Course>(query.pageSize));
}

export function useCourse(id: string | null | undefined): RepositoryQueryState<CourseAggregate | null> {
  const load = useCallback(
    () => (id ? curriculumRepository.getCourse(id) : Promise.resolve(null)),
    [id],
  );
  const result = useRepositoryQuery(load, [id], null);
  if (result.data && result.data.course.id !== id) {
    return { ...result, data: null, loading: true };
  }
  return result;
}

export function usePrograms(query: ProgramQuery = {}): RepositoryQueryState<PageResult<Program>> {
  const key = stableKey(query);
  const stableQuery = useMemo(() => JSON.parse(key) as ProgramQuery, [key]);
  const load = useCallback(() => curriculumRepository.listPrograms(stableQuery), [stableQuery]);
  return useRepositoryQuery(load, [key], emptyPage<Program>(query.pageSize));
}

export function useProgram(
  id: string | null | undefined,
): RepositoryQueryState<ProgramAggregate | null> {
  const load = useCallback(
    () => (id ? curriculumRepository.getProgram(id) : Promise.resolve(null)),
    [id],
  );
  const result = useRepositoryQuery(load, [id], null);
  if (result.data && result.data.program.id !== id) {
    return { ...result, data: null, loading: true };
  }
  return result;
}

export function useNotifications(
  query: NotificationQuery = {},
): RepositoryQueryState<PageResult<Notification>> {
  const key = stableKey(query);
  const stableQuery = useMemo(() => JSON.parse(key) as NotificationQuery, [key]);
  const load = useCallback(
    () => curriculumRepository.listNotifications(stableQuery),
    [stableQuery],
  );
  return useRepositoryQuery(load, [key], emptyPage<Notification>(query.pageSize));
}

export function useDashboard(actorId?: string): RepositoryQueryState<DashboardSummary | null> {
  const load = useCallback(() => curriculumRepository.getDashboard(actorId), [actorId]);
  return useRepositoryQuery(load, [actorId], null);
}

export function useReferences(): RepositoryQueryState<ReferenceData | null> {
  const load = useCallback(() => curriculumRepository.getReferences(), []);
  return useRepositoryQuery(load, [], null);
}

export function usePersonas(): RepositoryQueryState<Actor[]> {
  const load = useCallback(() => curriculumRepository.listPersonas(), []);
  return useRepositoryQuery(load, [], []);
}

export function useActivePersona(): RepositoryQueryState<Actor | null> {
  const load = useCallback(() => curriculumRepository.getActivePersona(), []);
  return useRepositoryQuery(load, [], null);
}
