import type {
  Actor,
  Course,
  CourseStatus,
  Role,
} from "../../lib/domain";

export const REVIEW_STATUSES = [
  "Department Review",
  "Curriculum Committee",
  "Articulation Review",
] as const satisfies readonly CourseStatus[];

export interface ApprovalDecision {
  advanceTo: CourseStatus;
  advanceLabel: string;
  returnTo: "Draft";
}

export interface CourseSubmissionAvailability {
  allowed: boolean;
  reason: string | null;
}

export function getCourseSubmissionAvailability(
  course: Pick<Course, "status" | "createdBy">,
  actor: Pick<Actor, "id" | "role"> | null | undefined,
): CourseSubmissionAvailability {
  if (course.status !== "Draft") {
    return {
      allowed: false,
      reason: "Only a draft course can be submitted for department review.",
    };
  }
  if (!actor) {
    return {
      allowed: false,
      reason: "Choose an active demo persona before submitting this draft.",
    };
  }
  if (actor.role === "faculty" || actor.id === course.createdBy) {
    return { allowed: true, reason: null };
  }
  return {
    allowed: false,
    reason:
      "Only a Faculty persona or this record's owner can submit the draft for department review.",
  };
}

export function getReviewStatuses(role: Role | undefined): CourseStatus[] {
  if (role === "chair") {
    return ["Department Review", "Curriculum Committee"];
  }
  if (role === "articulation") return ["Articulation Review"];
  if (role === "admin") return [...REVIEW_STATUSES];
  return [];
}

export function getApprovalDecision(
  status: CourseStatus,
  role: Role | undefined,
): ApprovalDecision | null {
  if (!getReviewStatuses(role).includes(status)) return null;

  if (status === "Department Review") {
    return {
      advanceTo: "Curriculum Committee",
      advanceLabel: "Advance to curriculum committee",
      returnTo: "Draft",
    };
  }
  if (status === "Curriculum Committee") {
    return {
      advanceTo: "Articulation Review",
      advanceLabel: "Advance to articulation review",
      returnTo: "Draft",
    };
  }
  if (status === "Articulation Review") {
    return {
      advanceTo: "Approved",
      advanceLabel: "Approve course",
      returnTo: "Draft",
    };
  }
  return null;
}

export function canConfirmApprovalAction(
  intent: "advance" | "return",
  comment: string,
): boolean {
  return intent === "advance" || comment.trim().length > 0;
}
