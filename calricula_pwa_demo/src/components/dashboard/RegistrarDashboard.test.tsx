import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dataHooks = vi.hoisted(() => ({
  curriculumRepository: {
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
  },
  useActivePersona: vi.fn(),
  useCourses: vi.fn(),
  useDashboard: vi.fn(),
  useNotifications: vi.fn(),
  usePersonas: vi.fn(),
}));

vi.mock("@/lib/data", () => dataHooks);

import { RegistrarDashboard } from "./RegistrarDashboard";

function queryState<T>(
  data: T,
  options: { error?: Error | null; loading?: boolean } = {},
) {
  return {
    data,
    error: options.error ?? null,
    loading: options.loading ?? false,
    refresh: vi.fn(),
  };
}

const actor = {
  id: "11111111-1111-4111-8111-111111111111",
  fullName: "Dr. Ada Faculty",
  role: "faculty",
};

function course(overrides: Record<string, unknown> = {}) {
  return {
    id: "course-1",
    subjectCode: "ENGL",
    courseNumber: "101",
    title: "College Composition",
    status: "Draft",
    createdBy: actor.id,
    updatedAt: "2026-07-20T00:00:00.000Z",
    units: 3,
    totalStudentLearningHours: 162,
    ...overrides,
  };
}

describe("RegistrarDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const courses = [
      course(),
      course({
        id: "course-2",
        courseNumber: "102",
        title: "Other Faculty Draft",
        createdBy: "99999999-9999-4999-8999-999999999999",
        updatedAt: "2026-07-21T00:00:00.000Z",
      }),
      course({
        id: "course-3",
        subjectCode: "MATH",
        courseNumber: "120",
        title: "Review Mathematics",
        status: "Department Review",
        totalStudentLearningHours: 20,
        updatedAt: "2026-07-22T00:00:00.000Z",
      }),
      course({
        id: "course-4",
        subjectCode: "HIST",
        courseNumber: "110",
        title: "Approved History",
        status: "Approved",
        updatedAt: "2026-07-23T00:00:00.000Z",
      }),
    ];
    dataHooks.useActivePersona.mockReturnValue(queryState(actor));
    dataHooks.usePersonas.mockReturnValue(queryState([actor]));
    dataHooks.useCourses.mockReturnValue(
      queryState({
        items: courses,
        total: courses.length,
        page: 1,
        pageSize: 250,
        pageCount: 1,
      }),
    );
    dataHooks.useDashboard.mockReturnValue(
      queryState({
        myDrafts: 1,
        pendingReview: 1,
        recentlyApproved: 1,
        unreadNotifications: 1,
        coursesByStatus: [
          { status: "Draft", count: 2, percentage: 50 },
          { status: "Department Review", count: 1, percentage: 25 },
          { status: "Approved", count: 1, percentage: 25 },
        ],
        recentActivity: [
          {
            id: "history-1",
            entityId: "course-4",
            entityType: "Course",
            fromStatus: "Articulation Review",
            toStatus: "Approved",
            changedBy: actor.id,
            createdAt: "2026-07-23T12:00:00.000Z",
          },
        ],
      }),
    );
    dataHooks.useNotifications.mockReturnValue(
      queryState({
        items: [
          {
            id: "notification-1",
            actorId: actor.id,
            title: "Your course was approved",
            message: "The local approval record is ready to review.",
            type: "approval",
            entityType: "Course",
            entityId: "course-4",
            readAt: null,
            createdAt: "2026-07-23T12:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 5,
        pageCount: 1,
      }),
    );
  });

  it("builds a faculty-specific queue and preserves compliance warnings", () => {
    render(<RegistrarDashboard />);

    expect(
      screen.getByRole("heading", { name: "Curriculum desk." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Review local course outlines, notifications, and approvals from the selected demo perspective.",
      ),
    ).toBeInTheDocument();

    const queue = screen.getByRole("table", {
      name: "Course outlines awaiting action for the selected demo role",
    });
    expect(within(queue).getByText("College Composition")).toBeInTheDocument();
    expect(
      within(queue).queryByText("Other Faculty Draft"),
    ).not.toBeInTheDocument();
    expect(within(queue).queryByText("Review Mathematics")).not.toBeInTheDocument();

    expect(
      screen.getByText("Outlines in progress").closest("article"),
    ).toHaveTextContent("3 of 4");
    expect(screen.getByText("Your course was approved")).toBeInTheDocument();
    expect(
      screen.getByText(/HIST 110 moved to Approved/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Hours review notice" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 outline needs review/i)).toBeInTheDocument();
  });

  it("shows loading states without inventing queue records", () => {
    dataHooks.useCourses.mockReturnValue(
      queryState(
        { items: [], total: 0, page: 1, pageSize: 250, pageCount: 0 },
        { loading: true },
      ),
    );
    dataHooks.useDashboard.mockReturnValue(
      queryState(null, { loading: true }),
    );
    dataHooks.useNotifications.mockReturnValue(
      queryState(
        { items: [], total: 0, page: 1, pageSize: 5, pageCount: 0 },
        { loading: true },
      ),
    );

    render(<RegistrarDashboard />);

    expect(screen.getByText("Reading the review ledger…")).toBeInTheDocument();
    expect(screen.getByText("Reading notifications…")).toBeInTheDocument();
    expect(
      screen.queryByRole("table", {
        name: "Course outlines awaiting action for the selected demo role",
      }),
    ).not.toBeInTheDocument();
  });

  it("surfaces repository errors while keeping local data intact", () => {
    dataHooks.useDashboard.mockReturnValue(
      queryState(null, {
        error: new Error("Dashboard summary is unavailable."),
      }),
    );

    render(<RegistrarDashboard />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Some desk records could not be read");
    expect(alert).toHaveTextContent("Dashboard summary is unavailable.");
    expect(alert).toHaveTextContent("Your locally saved data has not been reset.");
  });

  it("marks one notification read or all notifications read", async () => {
    dataHooks.curriculumRepository.markNotificationRead.mockResolvedValue({});
    dataHooks.curriculumRepository.markAllNotificationsRead.mockResolvedValue(1);
    render(<RegistrarDashboard />);

    fireEvent.click(screen.getByRole("button", { name: "Mark read" }));
    await waitFor(() =>
      expect(
        dataHooks.curriculumRepository.markNotificationRead,
      ).toHaveBeenCalledWith("notification-1", true),
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    await waitFor(() =>
      expect(
        dataHooks.curriculumRepository.markAllNotificationsRead,
      ).toHaveBeenCalledWith(actor.id),
    );
  });

  it("offers a read notification an explicit mark-unread action", async () => {
    dataHooks.curriculumRepository.markNotificationRead.mockResolvedValue({});
    dataHooks.useNotifications.mockReturnValue(
      queryState({
        items: [
          {
            id: "notification-read",
            actorId: actor.id,
            title: "Reviewed notice",
            message: "This notice was already reviewed.",
            type: "system",
            entityType: null,
            entityId: null,
            readAt: "2026-07-23T13:00:00.000Z",
            createdAt: "2026-07-23T12:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 5,
        pageCount: 1,
      }),
    );
    render(<RegistrarDashboard />);

    fireEvent.click(screen.getByRole("button", { name: "Mark unread" }));
    await waitFor(() =>
      expect(
        dataHooks.curriculumRepository.markNotificationRead,
      ).toHaveBeenCalledWith("notification-read", false),
    );
  });

  it.each([
    [
      "chair",
      ["Department Review", "Curriculum Committee"],
      ["Articulation Review", "Draft"],
    ],
    [
      "admin",
      [
        "Department Review",
        "Curriculum Committee",
        "Articulation Review",
      ],
      ["Draft"],
    ],
  ] as const)(
    "aligns the %s dashboard queue and count with the approvals docket",
    (role, includedStatuses, excludedStatuses) => {
      const roleActor = { ...actor, role };
      const roleCourses = [
        course({ id: "draft", title: "Draft course", status: "Draft" }),
        course({
          id: "department",
          title: "Department course",
          status: "Department Review",
        }),
        course({
          id: "committee",
          title: "Committee course",
          status: "Curriculum Committee",
        }),
        course({
          id: "articulation",
          title: "Articulation course",
          status: "Articulation Review",
        }),
      ];
      dataHooks.useActivePersona.mockReturnValue(queryState(roleActor));
      dataHooks.useCourses.mockReturnValue(
        queryState({
          items: roleCourses,
          total: roleCourses.length,
          page: 1,
          pageSize: 250,
          pageCount: 1,
        }),
      );
      dataHooks.useDashboard.mockReturnValue(
        queryState({
          myDrafts: 0,
          pendingReview: includedStatuses.length,
          recentlyApproved: 0,
          unreadNotifications: 0,
          coursesByStatus: [],
          recentActivity: [],
        }),
      );

      render(<RegistrarDashboard />);
      const queue = screen.getByRole("table", {
        name: "Course outlines awaiting action for the selected demo role",
      });
      includedStatuses.forEach((status) => {
        expect(within(queue).getByText(status)).toBeInTheDocument();
      });
      excludedStatuses.forEach((status) => {
        expect(within(queue).queryByText(status)).not.toBeInTheDocument();
      });
      expect(
        screen.getByText("Awaiting your review").closest("article"),
      ).toHaveTextContent(String(includedStatuses.length));
    },
  );
});
