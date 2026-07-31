const COURSE_DRAFT_RECOVERY_PREFIX = "calricula.course-draft-recovery.v1:";

export function courseDraftRecoveryKey(courseId: string): string {
  return `${COURSE_DRAFT_RECOVERY_PREFIX}${courseId}`;
}

export function clearAllCourseDraftRecoveries(): void {
  if (typeof window === "undefined") return;
  try {
    const keys = Array.from(
      { length: window.localStorage.length },
      (_, index) => window.localStorage.key(index),
    ).filter(
      (key): key is string =>
        typeof key === "string" && key.startsWith(COURSE_DRAFT_RECOVERY_PREFIX),
    );
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // IndexedDB reset still succeeds when browser key-value storage is blocked.
  }
}
