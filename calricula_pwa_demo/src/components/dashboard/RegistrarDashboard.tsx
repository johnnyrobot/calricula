"use client";

import {
  ArrowRight,
  Bell,
  BookOpen,
  ClipboardCheck,
  FilePlus2,
  Inbox,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { checkMinimumHoursPerUnit } from "@/lib/compliance/hours";
import { getReviewStatuses } from "@/components/approvals/workflow";
import {
  curriculumRepository,
  type Course,
  type CourseStatus,
  type Notification,
  type Role,
  type WorkflowHistory,
  useActivePersona,
  useCourses,
  useDashboard,
  useNotifications,
  usePersonas,
} from "@/lib/data";

import { MetricPanel } from "./MetricPanel";

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

function reviewStatuses(role: Role | undefined): CourseStatus[] {
  if (role === "faculty") return ["Draft"];
  return getReviewStatuses(role);
}

function queueForRole(
  courses: Course[],
  role: Role | undefined,
  actorId: string | undefined,
) {
  const statuses = reviewStatuses(role);
  return courses
    .filter((course) => statuses.includes(course.status))
    .filter((course) =>
      role === "faculty" && actorId ? course.createdBy === actorId : true,
    )
    .sort(
      (left, right) =>
        new Date(left.updatedAt).valueOf() - new Date(right.updatedAt).valueOf(),
    )
    .slice(0, 6);
}

function statusClass(status: CourseStatus) {
  if (status === "Approved") return "status-seal--approved";
  if (status === "Draft") return "status-seal--draft";
  return "status-seal--review";
}

function activityTone(history: WorkflowHistory) {
  if (history.toStatus === "Approved") return "approved";
  if (history.fromStatus) {
    const order = [
      "Draft",
      "Department Review",
      "Curriculum Committee",
      "Articulation Review",
      "Approved",
    ];
    const fromIndex = order.indexOf(history.fromStatus);
    const toIndex = order.indexOf(history.toStatus);
    if (fromIndex >= 0 && toIndex >= 0 && toIndex < fromIndex) return "returned";
  }
  return "review";
}

function notificationTone(notification: Notification) {
  if (notification.type === "approval") return "approved";
  if (notification.type === "return") return "returned";
  return "review";
}

export function RegistrarDashboard() {
  const activePersona = useActivePersona();
  const personas = usePersonas();
  const dashboard = useDashboard(activePersona.data?.id);
  const courses = useCourses({
    page: 1,
    pageSize: 250,
    sortBy: "updatedAt",
    sortDirection: "desc",
  });
  const notifications = useNotifications({
    userId: activePersona.data?.id ?? "00000000-0000-0000-0000-000000000000",
    page: 1,
    pageSize: 5,
  });
  const [notificationBusy, setNotificationBusy] = useState<string | null>(
    null,
  );
  const [notificationError, setNotificationError] = useState("");

  const queue = useMemo(
    () =>
      queueForRole(
        courses.data.items,
        activePersona.data?.role,
        activePersona.data?.id,
      ),
    [activePersona.data, courses.data.items],
  );
  const courseById = useMemo(
    () => new Map(courses.data.items.map((course) => [course.id, course])),
    [courses.data.items],
  );
  const actorById = useMemo(
    () => new Map(personas.data.map((actor) => [actor.id, actor])),
    [personas.data],
  );
  const activeCount =
    dashboard.data?.coursesByStatus
      .filter((entry) => entry.status !== "Approved")
      .reduce((total, entry) => total + entry.count, 0) ??
    courses.data.items.filter((course) => course.status !== "Approved").length;
  const flaggedCourses = courses.data.items.filter(
    (course) =>
      !checkMinimumHoursPerUnit(
        course.units,
        course.totalStudentLearningHours,
      ).isCompliant,
  );
  const summary = dashboard.data;
  const hasError =
    dashboard.error ||
    courses.error ||
    activePersona.error ||
    personas.error ||
    notifications.error;

  const setNotificationRead = async (
    notification: Notification,
    read: boolean,
  ) => {
    setNotificationBusy(notification.id);
    setNotificationError("");
    try {
      await curriculumRepository.markNotificationRead(notification.id, read);
      notifications.refresh();
      dashboard.refresh();
    } catch (error) {
      setNotificationError(
        error instanceof Error
          ? error.message
          : "The notification could not be updated.",
      );
    } finally {
      setNotificationBusy(null);
    }
  };

  const markAllNotificationsRead = async () => {
    if (!activePersona.data) return;
    setNotificationBusy("all");
    setNotificationError("");
    try {
      await curriculumRepository.markAllNotificationsRead(
        activePersona.data.id,
      );
      notifications.refresh();
      dashboard.refresh();
    } catch (error) {
      setNotificationError(
        error instanceof Error
          ? error.message
          : "Notifications could not be updated.",
      );
    } finally {
      setNotificationBusy(null);
    }
  };

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Local curriculum workspace</p>
          <h1 className="folio-title">Curriculum desk.</h1>
          <p className="page-deck">
            Review local course outlines, notifications, and approvals from the
            selected demo perspective.
          </p>
        </div>
        <div className="page-actions">
          <Link className="luminous-button-secondary" href="/courses/">
            <BookOpen aria-hidden="true" size={17} />
            Browse outlines
          </Link>
          <Link className="luminous-button-primary" href="/courses/new/">
            <FilePlus2 aria-hidden="true" size={17} />
            New course
          </Link>
        </div>
      </header>

      {hasError && (
        <div className="callout callout--warning mb-5" role="alert">
          <h2>Some desk records could not be read</h2>
          <p>
            {hasError.message} Try reloading the page. Your locally saved data has
            not been reset.
          </p>
        </div>
      )}

      <section aria-labelledby="desk-summary-title">
        <h2 className="sr-only" id="desk-summary-title">
          Curriculum desk summary
        </h2>
        <div className="metric-grid">
          <MetricPanel
            label="Outlines in progress"
            value={activeCount}
            suffix={`of ${courses.data.total}`}
            detail="All records not yet approved"
          />
          <MetricPanel
            label="My drafts"
            value={summary?.myDrafts ?? 0}
            detail="Drafts owned by this demo role"
          />
          <MetricPanel
            label="Awaiting your review"
            value={summary?.pendingReview ?? 0}
            detail="At this role’s workflow stage"
          />
          <MetricPanel
            label="Recently approved"
            value={summary?.recentlyApproved ?? 0}
            detail="Approved in the recent activity window"
          />
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="record-panel" aria-labelledby="queue-title">
          <div className="panel-header">
            <div>
              <h2 id="queue-title">Outlines awaiting your action</h2>
              <p>
                {activePersona.data
                  ? `${activePersona.data.fullName} · ${queue.length} in queue`
                  : "Loading demo perspective…"}
              </p>
            </div>
            <Link className="panel-link" href="/approvals/">
              View all
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
          {courses.loading || dashboard.loading ? (
            <div className="empty-record" role="status" aria-live="polite">
              <div className="catalog-spinner" aria-hidden="true" />
              <p>Reading the review ledger…</p>
            </div>
          ) : queue.length ? (
            <div className="queue-table-wrap">
              <table className="luminous-table">
                <caption className="sr-only">
                  Course outlines awaiting action for the selected demo role
                </caption>
                <thead>
                  <tr>
                    <th className="luminous-th" scope="col">
                      Course
                    </th>
                    <th className="luminous-th" scope="col">
                      Title
                    </th>
                    <th className="luminous-th" scope="col">
                      Stage
                    </th>
                    <th className="luminous-th" scope="col">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((course) => (
                    <tr key={course.id}>
                      <td className="luminous-td queue-course">
                        <Link
                          href={`/courses/view/?id=${encodeURIComponent(course.id)}`}
                        >
                          {course.subjectCode} {course.courseNumber}
                        </Link>
                      </td>
                      <td className="luminous-td queue-title">{course.title}</td>
                      <td className="luminous-td">
                        <span
                          className={`status-seal ${statusClass(course.status)}`}
                        >
                          {course.status}
                        </span>
                      </td>
                      <td className="luminous-td">
                        <time dateTime={course.updatedAt}>
                          {dateFormatter.format(new Date(course.updatedAt))}
                        </time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-record">
              <ClipboardCheck aria-hidden="true" />
              <p>No outlines are waiting at this role&apos;s stage.</p>
            </div>
          )}
        </section>

        <div className="dashboard-aside">
          <section
            className="record-panel"
            id="notifications"
            aria-labelledby="notifications-title"
          >
            <div className="panel-header">
              <div>
                <h2 id="notifications-title">Notifications</h2>
                <p>{summary?.unreadNotifications ?? 0} unread</p>
              </div>
              <div className="flex items-center gap-2">
                {(summary?.unreadNotifications ?? 0) > 0 ? (
                  <button
                    className="luminous-button-tertiary"
                    disabled={notificationBusy !== null}
                    onClick={() => void markAllNotificationsRead()}
                    type="button"
                  >
                    {notificationBusy === "all"
                      ? "Marking…"
                      : "Mark all read"}
                  </button>
                ) : null}
                <Bell aria-hidden="true" size={19} />
              </div>
            </div>
            {notificationError ? (
              <p
                className="mb-3 border-l-2 border-[var(--returned)] pl-3 text-sm text-[var(--returned)]"
                role="alert"
              >
                {notificationError}
              </p>
            ) : null}
            {notifications.loading ? (
              <div className="empty-record" role="status">
                <p>Reading notifications…</p>
              </div>
            ) : notifications.data.items.length ? (
              <ul className="activity-list">
                {notifications.data.items.map((notification) => {
                  const isRead = Boolean(notification.readAt);
                  const entityHref =
                    notification.entityType === "Course" &&
                    notification.entityId
                      ? `/courses/view/?id=${encodeURIComponent(notification.entityId)}`
                      : notification.entityType === "Program" &&
                          notification.entityId
                        ? `/programs/view/?id=${encodeURIComponent(notification.entityId)}`
                        : null;
                  return (
                    <li
                      className="activity-item"
                      data-read={isRead ? "true" : "false"}
                      data-tone={notificationTone(notification)}
                      key={notification.id}
                    >
                      <span className="activity-marker" aria-hidden="true" />
                      <div className="activity-copy">
                        <strong>{notification.title}</strong>
                        {notification.message ? (
                          <span className="mt-1 block text-sm font-normal">
                            {notification.message}
                          </span>
                        ) : null}
                        <span className="activity-time">
                          <time dateTime={notification.createdAt}>
                            {dateTimeFormatter.format(
                              new Date(notification.createdAt),
                            )}
                          </time>
                        </span>
                        <span className="mt-2 flex flex-wrap gap-3">
                          {entityHref ? (
                            <Link className="panel-link" href={entityHref}>
                              Open record
                            </Link>
                          ) : null}
                          <button
                            className="panel-link"
                            disabled={notificationBusy !== null}
                            onClick={() =>
                              void setNotificationRead(notification, !isRead)
                            }
                            type="button"
                          >
                            {notificationBusy === notification.id
                              ? "Updating…"
                              : isRead
                                ? "Mark unread"
                                : "Mark read"}
                          </button>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="empty-record">
                <Inbox aria-hidden="true" />
                <p>No notifications for this demo role.</p>
              </div>
            )}
          </section>

          <section className="record-panel" aria-labelledby="activity-title">
            <div className="panel-header">
              <div>
                <h2 id="activity-title">Recent activity</h2>
                <p>Workflow changes in this browser</p>
              </div>
            </div>
            {summary?.recentActivity.length ? (
              <ul className="activity-list">
                {summary.recentActivity.slice(0, 5).map((history) => {
                  const course = courseById.get(history.entityId);
                  const actor = actorById.get(history.changedBy);
                  const recordName = course
                    ? `${course.subjectCode} ${course.courseNumber}`
                    : history.entityType === "Program"
                      ? "Program record"
                      : "Course record";
                  return (
                    <li
                      className="activity-item"
                      data-tone={activityTone(history)}
                      key={history.id}
                    >
                      <span className="activity-marker" aria-hidden="true" />
                      <p className="activity-copy">
                        {recordName} moved to {history.toStatus}
                        <span className="activity-time">
                          {actor ? `${actor.fullName} · ` : ""}
                          <time dateTime={history.createdAt}>
                            {dateTimeFormatter.format(
                              new Date(history.createdAt),
                            )}
                          </time>
                        </span>
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="empty-record">
                <p>No workflow changes yet.</p>
              </div>
            )}
          </section>

          {flaggedCourses.length > 0 && (
            <aside className="notice-panel" aria-labelledby="compliance-title">
              <h2 id="compliance-title">Hours review notice</h2>
              <p>
                {flaggedCourses.length}{" "}
                {flaggedCourses.length === 1 ? "outline needs" : "outlines need"}{" "}
                review against the minimum student-learning-hours check.
              </p>
              <Link className="panel-link" href="/courses/">
                Review outlines
                <ArrowRight aria-hidden="true" />
              </Link>
            </aside>
          )}
        </div>
      </div>
    </>
  );
}
