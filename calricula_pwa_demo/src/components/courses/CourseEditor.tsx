'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  Link2,
  ListTree,
  MessageSquareText,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
} from 'lucide-react';
import type { CourseAggregate } from '@/lib/data';
import type { Department, TopCode } from '@/lib/domain';
import { useCourseDraftSession } from './course-draft-session';
import {
  CCNSection,
  ComplianceSection,
  ContentSection,
  OverviewSection,
  RequisitesSection,
  SLOSection,
} from './CourseEditorSections';
import {
  CourseBreadcrumb,
  CourseCode,
  CourseStatusBadge,
  SaveIndicator,
} from './CoursePrimitives';
import type {
  CCNMatchView,
  ComplianceAuditView,
  CourseViewModel,
} from './types';

type TabId =
  | 'overview'
  | 'slos'
  | 'content'
  | 'requisites'
  | 'ccn'
  | 'compliance'
  | 'comments'
  | 'history';

const TABS: Array<{
  id: TabId;
  label: string;
  shortLabel: string;
  icon: typeof FileText;
}> = [
  { id: 'overview', label: 'Basic information', shortLabel: 'Basics', icon: FileText },
  { id: 'slos', label: 'Student learning outcomes', shortLabel: 'SLOs', icon: BookOpen },
  { id: 'content', label: 'Course content', shortLabel: 'Content', icon: ListTree },
  { id: 'requisites', label: 'Requisites', shortLabel: 'Requisites', icon: Link2 },
  { id: 'ccn', label: 'CCN and coding', shortLabel: 'CCN & coding', icon: FileCheck2 },
  { id: 'compliance', label: 'Compliance audit', shortLabel: 'Compliance', icon: ShieldCheck },
  { id: 'comments', label: 'Comments', shortLabel: 'Comments', icon: MessageSquareText },
  { id: 'history', label: 'History', shortLabel: 'History', icon: Clock3 },
];

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

export function CourseEditor({
  initialCourse,
  aggregate,
  departments,
  courseOptions,
  ccnMatches,
  topCodes,
  audit,
  onSave,
  onAddComment,
  onResolveComment,
  onSubmitForReview,
  canSubmitForReview,
  submitDisabledReason,
}: {
  initialCourse: CourseViewModel;
  aggregate: CourseAggregate;
  departments: Department[];
  courseOptions: CourseViewModel[];
  ccnMatches: CCNMatchView[];
  topCodes: TopCode[];
  audit: ComplianceAuditView;
  onSave: (course: CourseViewModel) => Promise<void>;
  onAddComment: (section: string, content: string) => Promise<void>;
  onResolveComment: (commentId: string, resolved: boolean) => Promise<void>;
  onSubmitForReview: () => Promise<void>;
  canSubmitForReview: boolean;
  submitDisabledReason?: string | null;
}) {
  const router = useRouter();
  const {
    course,
    change,
    saveState,
    saveError,
    flush,
    navigate,
    externalUpdate,
    acceptExternalUpdate,
    keepLocalDraft,
    exportUnsavedDraft,
  } = useCourseDraftSession({ initialCourse, onSave });
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [comment, setComment] = useState('');
  const [commentSection, setCommentSection] = useState('General');
  const [commentError, setCommentError] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentActionId, setCommentActionId] = useState<string | null>(null);
  const [commentActionError, setCommentActionError] = useState('');
  const tabListRef = useRef<HTMLDivElement>(null);
  const comments = initialCourse.comments;
  const history = initialCourse.history;
  // The draft session clears its own message on every save attempt, so at most
  // one of these is set and the alert below shows whichever it is.
  const editorError = saveError || submitError;

  const selectTab = async (tab: TabId) => {
    await flush();
    setActiveTab(tab);
  };

  const moveTab = (event: React.KeyboardEvent<HTMLButtonElement>, current: number) => {
    let next = current;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % TABS.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (current - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault();
    const buttons = tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[next]?.focus();
    void selectTab(TABS[next].id);
  };

  const currentIndex = TABS.findIndex((tab) => tab.id === activeTab);
  const addComment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = comment.trim();
    if (!content) {
      setCommentError('Enter a comment before posting.');
      return;
    }
    setCommentBusy(true);
    setCommentError('');
    try {
      await onAddComment(commentSection, content);
      setComment('');
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'The comment could not be posted.');
    } finally {
      setCommentBusy(false);
    }
  };

  const submitForReview = async () => {
    if (!canSubmitForReview) return;
    const saved = await flush();
    if (!saved) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await onSubmitForReview();
      router.push(`/courses/view/?id=${encodeURIComponent(course.id)}`);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'The draft could not be submitted.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCommentResolved = async (commentId: string, resolved: boolean) => {
    setCommentActionId(commentId);
    setCommentActionError('');
    try {
      await onResolveComment(commentId, resolved);
    } catch (error) {
      setCommentActionError(
        error instanceof Error ? error.message : 'The comment could not be updated.',
      );
    } finally {
      setCommentActionId(null);
    }
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <OverviewSection
            course={course}
            aggregate={aggregate}
            departments={departments}
            onChange={change}
          />
        );
      case 'slos':
        return <SLOSection course={course} aggregate={aggregate} onChange={change} />;
      case 'content':
        return <ContentSection course={course} aggregate={aggregate} onChange={change} />;
      case 'requisites':
        return (
          <RequisitesSection
            course={course}
            courseOptions={courseOptions}
            circularError={/circular/i.test(saveError) ? saveError : undefined}
            onChange={change}
          />
        );
      case 'ccn':
        return (
          <CCNSection
            course={course}
            aggregate={aggregate}
            matches={ccnMatches}
            topCodes={topCodes}
            onChange={change}
          />
        );
      case 'compliance':
        return <ComplianceSection audit={audit} aggregate={aggregate} />;
      case 'comments':
        return (
          <div className="space-y-7">
            <header className="border-b border-hairline pb-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-gold-ink">
                Faculty and reviewer thread
              </p>
              <h2 className="mt-2 font-serif text-3xl font-semibold text-ink">Comments</h2>
              <p className="mt-2 font-sans text-sm leading-6 text-muted">
                Comments are attached to the current editor section and retained with the local record.
              </p>
            </header>
            <form onSubmit={addComment} className="border border-hairline bg-surface p-5">
              <label htmlFor="course-comment-section" className="luminous-label">
                Outline section
              </label>
              <select
                id="course-comment-section"
                value={commentSection}
                onChange={(event) => setCommentSection(event.target.value)}
                className="luminous-select mb-4"
              >
                <option>General</option>
                {TABS.filter((tab) => tab.id !== 'comments' && tab.id !== 'history').map(
                  (tab) => (
                    <option key={tab.id} value={tab.shortLabel}>
                      {tab.shortLabel}
                    </option>
                  ),
                )}
              </select>
              <label htmlFor="new-course-comment" className="luminous-label">
                Comment
              </label>
              <textarea
                id="new-course-comment"
                value={comment}
                onChange={(event) => {
                  setComment(event.target.value);
                  setCommentError('');
                }}
                rows={4}
                className="luminous-textarea"
                aria-invalid={Boolean(commentError)}
                aria-describedby={commentError ? 'new-course-comment-error' : undefined}
              />
              {commentError ? (
                <p id="new-course-comment-error" role="alert" className="mt-2 text-sm text-seal-returned">
                  {commentError}
                </p>
              ) : null}
              <button type="submit" disabled={commentBusy} className="luminous-button-primary mt-4">
                <MessageSquareText aria-hidden="true" className="h-4 w-4" />
                {commentBusy ? 'Posting…' : 'Post comment'}
              </button>
            </form>
            {commentActionError ? (
              <p
                className="border border-seal-returned bg-seal-returned/5 px-4 py-3 font-sans text-sm text-seal-returned"
                role="alert"
              >
                {commentActionError}
              </p>
            ) : null}
            {comments.length ? (
              <ol className="space-y-3">
                {comments.map((entry) => (
                  <li key={entry.id} className="border border-hairline bg-surface p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-sans text-sm font-semibold text-ink">{entry.authorName}</p>
                        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                          {entry.authorRole} · {entry.section} · {formatDate(entry.createdAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void toggleCommentResolved(entry.id, !entry.resolved)
                        }
                        disabled={commentActionId !== null}
                        className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-navy hover:underline"
                      >
                        {entry.resolved ? <RotateCcw aria-hidden="true" className="h-4 w-4" /> : <Check aria-hidden="true" className="h-4 w-4" />}
                        {commentActionId === entry.id
                          ? 'Updating…'
                          : entry.resolved
                            ? 'Reopen'
                            : 'Resolve'}
                      </button>
                    </div>
                    <p className={`mt-3 font-sans text-sm leading-6 ${entry.resolved ? 'text-muted line-through' : 'text-ink-soft'}`}>
                      {entry.body}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="border border-dashed border-hairline-strong p-8 text-center text-sm text-muted">
                No comments have been posted.
              </p>
            )}
          </div>
        );
      case 'history':
        return (
          <div className="space-y-7">
            <header className="border-b border-hairline pb-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-gold-ink">
                Immutable activity log
              </p>
              <h2 className="mt-2 font-serif text-3xl font-semibold text-ink">Course history</h2>
              <p className="mt-2 font-sans text-sm leading-6 text-muted">
                Workflow transitions are retained with the outline for review context and provenance.
              </p>
            </header>
            {history.length ? (
              <ol className="relative ml-2 border-l border-hairline-strong pl-7">
                {history.map((entry) => (
                  <li key={entry.id} className="relative pb-7 last:pb-0">
                    <span
                      aria-hidden="true"
                      className="absolute -left-[33px] top-1.5 h-2.5 w-2.5 border border-gold bg-surface"
                    />
                    <p className="font-sans text-sm font-semibold text-ink">{entry.action}</p>
                    <p className="mt-1 font-sans text-sm leading-6 text-ink-soft">{entry.detail}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.09em] text-muted">
                      {entry.actorName} · {formatDate(entry.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="border border-dashed border-hairline-strong p-8 text-center text-sm text-muted">
                No history events are available.
              </p>
            )}
          </div>
        );
    }
  };

  return (
    <div>
      <CourseBreadcrumb onBack={() => void navigate('/courses/')}>
        <CourseCode subjectCode={course.subjectCode} courseNumber={course.courseNumber} /> / Edit
      </CourseBreadcrumb>

      <header className="mb-5 border-y-2 border-t-navy border-b-hairline-strong bg-surface px-5 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-gold-ink">
                Course Outline Editor
              </p>
              <CourseStatusBadge status={course.status} />
            </div>
            <h1 className="mt-2 truncate font-serif text-2xl font-semibold text-ink sm:text-3xl">
              <CourseCode subjectCode={course.subjectCode} courseNumber={course.courseNumber} />
              <span aria-hidden="true"> — </span>
              {course.title}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SaveIndicator state={saveState} />
            {saveState === 'error' ? (
              <>
                <button type="button" onClick={() => void flush()} className="luminous-button-secondary">
                  <Save aria-hidden="true" className="h-4 w-4" />
                  Retry save
                </button>
                <button type="button" onClick={exportUnsavedDraft} className="luminous-button-secondary">
                  <Download aria-hidden="true" className="h-4 w-4" />
                  Export unsaved draft
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => void navigate(`/courses/view/?id=${encodeURIComponent(course.id)}`)}
              className="luminous-button-secondary"
            >
              Close editor
            </button>
            {course.status === 'Draft' ? (
              <button
                type="button"
                onClick={submitForReview}
                disabled={submitting || !canSubmitForReview}
                aria-describedby={
                  !canSubmitForReview && submitDisabledReason
                    ? 'course-submit-disabled-reason'
                    : undefined
                }
                className="luminous-button-primary"
              >
                <Send aria-hidden="true" className="h-4 w-4" />
                {submitting ? 'Submitting…' : 'Submit for review'}
              </button>
            ) : null}
            {course.status === 'Draft' &&
            !canSubmitForReview &&
            submitDisabledReason ? (
              <p
                className="basis-full text-right font-sans text-xs leading-5 text-muted"
                id="course-submit-disabled-reason"
              >
                {submitDisabledReason}
              </p>
            ) : null}
          </div>
        </div>
        {editorError ? (
          <div className="mt-4 flex items-start gap-3 border border-seal-returned bg-seal-returned/5 px-4 py-3" role="alert">
            <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-seal-returned" />
            <p className="font-sans text-sm leading-6 text-seal-returned">{editorError}</p>
          </div>
        ) : null}
        {externalUpdate ? (
          <div
            className="mt-4 border border-gold bg-gold/10 px-4 py-4"
            role="alert"
          >
            <div className="flex items-start gap-3">
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0 text-gold-ink"
              />
              <div>
                <p className="font-sans text-sm font-semibold text-ink">
                  This course changed in another tab.
                </p>
                <p className="mt-1 font-sans text-sm leading-6 text-ink-soft">
                  Autosave is paused so this tab cannot overwrite the newer
                  local record. Reload the other tab&apos;s version, or
                  explicitly keep and save this draft.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="luminous-button-primary"
                    onClick={acceptExternalUpdate}
                    type="button"
                  >
                    Reload other tab&apos;s changes
                  </button>
                  <button
                    className="luminous-button-secondary"
                    onClick={() => void keepLocalDraft()}
                    type="button"
                  >
                    Keep and save my draft
                  </button>
                  <button
                    className="luminous-button-tertiary"
                    onClick={exportUnsavedDraft}
                    type="button"
                  >
                    <Download aria-hidden="true" className="h-4 w-4" />
                    Export my draft
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[238px_minmax(0,1fr)]">
        <aside className="sticky top-4 hidden border border-hairline bg-surface xl:block">
          <div className="border-b border-hairline bg-surface-2 px-4 py-3">
            <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
              Outline sections
            </p>
          </div>
          <div ref={tabListRef} role="tablist" aria-label="Course editor sections" aria-orientation="vertical">
            {TABS.map((tab, index) => {
              const Icon = tab.icon;
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  id={`course-editor-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`course-editor-panel-${tab.id}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => void selectTab(tab.id)}
                  onKeyDown={(event) => moveTab(event, index)}
                  className={`flex min-h-12 w-full items-center gap-3 border-b border-hairline px-4 text-left font-sans text-sm last:border-b-0 ${
                    active
                      ? 'border-l-2 border-l-gold bg-navy/5 font-semibold text-navy'
                      : 'border-l-2 border-l-transparent text-muted hover:bg-surface-2 hover:text-ink'
                  }`}
                >
                  <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                  {tab.shortLabel}
                  {tab.id === 'comments' && comments.length ? (
                    <span className="ml-auto bg-gold px-1.5 py-0.5 font-mono text-[10px] text-navy">
                      {comments.length}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </aside>

        <div>
          <div className="mb-4 xl:hidden">
            <label htmlFor="mobile-editor-section" className="luminous-label">
              Editor section
            </label>
            <select
              id="mobile-editor-section"
              value={activeTab}
              onChange={(event) => void selectTab(event.target.value as TabId)}
              className="luminous-select"
            >
              {TABS.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.shortLabel}
                </option>
              ))}
            </select>
          </div>

          <section
            id={`course-editor-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`course-editor-tab-${activeTab}`}
            tabIndex={0}
            className="luminous-card min-h-[620px] p-5 focus:outline-none sm:p-8"
          >
            {renderTab()}
          </section>

          <nav
            aria-label="Editor section navigation"
            className="mt-4 flex items-center justify-between border border-hairline bg-surface px-4 py-3"
          >
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => void selectTab(TABS[currentIndex - 1].id)}
              className="luminous-button-secondary"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              Previous
            </button>
            <span className="hidden font-mono text-xs text-muted sm:inline">
              {currentIndex + 1} / {TABS.length}
            </span>
            <button
              type="button"
              disabled={currentIndex === TABS.length - 1}
              onClick={() => void selectTab(TABS[currentIndex + 1].id)}
              className="luminous-button-primary"
            >
              Next
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}
