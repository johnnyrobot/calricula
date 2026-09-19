import { beforeEach, describe, expect, it } from "vitest";

import {
  clearAllCourseDraftRecoveries,
  courseDraftRecoveryKey,
} from "./course-draft-recovery";

describe("course draft recovery storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("clears every recovery draft without deleting unrelated local state", () => {
    window.localStorage.setItem(courseDraftRecoveryKey("course-1"), "draft one");
    window.localStorage.setItem(courseDraftRecoveryKey("course-2"), "draft two");
    window.localStorage.setItem("calricula.installation-id.v1", "installation");

    clearAllCourseDraftRecoveries();

    expect(
      window.localStorage.getItem(courseDraftRecoveryKey("course-1")),
    ).toBeNull();
    expect(
      window.localStorage.getItem(courseDraftRecoveryKey("course-2")),
    ).toBeNull();
    expect(
      window.localStorage.getItem("calricula.installation-id.v1"),
    ).toBe("installation");
  });
});
