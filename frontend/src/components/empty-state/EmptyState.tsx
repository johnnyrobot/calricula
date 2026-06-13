'use client';

// ===========================================
// EmptyState Component
// ===========================================
// Reusable empty state component for list pages
// Shows a friendly message when there's no data to display

import React from 'react';
import Link from 'next/link';
import {
  DocumentTextIcon,
  AcademicCapIcon,
  ClipboardDocumentListIcon,
  PencilSquareIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  FolderOpenIcon,
} from '@heroicons/react/24/outline';

// ===========================================
// Types
// ===========================================

export type EmptyStateVariant =
  | 'courses'
  | 'programs'
  | 'drafts'
  | 'approvals'
  | 'search'
  | 'generic';

interface EmptyStateProps {
  /**
   * The variant determines the icon, title, and default message
   */
  variant: EmptyStateVariant;

  /**
   * Whether filters or search are currently active
   * Changes the message to reflect that no results match the criteria
   */
  hasFilters?: boolean;

  /**
   * Custom title (overrides default)
   */
  title?: string;

  /**
   * Custom message (overrides default)
   */
  message?: string;

  /**
   * CTA button text (if not provided, no button is shown)
   */
  actionLabel?: string;

  /**
   * CTA button link (if actionLabel provided)
   */
  actionHref?: string;

  /**
   * CTA button click handler (alternative to actionHref)
   */
  onAction?: () => void;

  /**
   * Optional custom icon component
   */
  icon?: React.ComponentType<{ className?: string }>;

  /**
   * Size variant
   */
  size?: 'small' | 'default' | 'large';
}

// ===========================================
// Variant Configurations
// ===========================================

interface VariantConfig {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  filterTitle: string;
  message: string;
  filterMessage: string;
  actionLabel?: string;
  actionHref?: string;
}

const variantConfigs: Record<EmptyStateVariant, VariantConfig> = {
  courses: {
    icon: DocumentTextIcon,
    title: 'No courses yet',
    filterTitle: 'No courses found',
    message: 'Get started by creating your first Course Outline of Record.',
    filterMessage: "Try adjusting your search or filters to find what you're looking for.",
    actionLabel: 'Create New Course',
    actionHref: '/courses/new',
  },
  programs: {
    icon: AcademicCapIcon,
    title: 'No programs yet',
    filterTitle: 'No programs found',
    message: 'Get started by creating your first degree or certificate program.',
    filterMessage: "Try adjusting your search or filters to find what you're looking for.",
    actionLabel: 'Create New Program',
    actionHref: '/programs/new',
  },
  drafts: {
    icon: PencilSquareIcon,
    title: 'No drafts',
    filterTitle: 'No drafts found',
    message: "You don't have any drafts. Start creating a new course or program to begin.",
    filterMessage: "Try adjusting your search or filters to find what you're looking for.",
    actionLabel: 'Create New Course',
    actionHref: '/courses/new',
  },
  approvals: {
    icon: ClipboardDocumentListIcon,
    title: 'Queue is empty',
    filterTitle: 'No items found',
    message: 'No items are currently pending your review. Check back later!',
    filterMessage: 'No items match your search criteria.',
  },
  search: {
    icon: MagnifyingGlassIcon,
    title: 'No results',
    filterTitle: 'No results found',
    message: 'We couldn\'t find what you\'re looking for.',
    filterMessage: 'Try different search terms or remove some filters.',
  },
  generic: {
    icon: FolderOpenIcon,
    title: 'Nothing here yet',
    filterTitle: 'No results',
    message: 'There\'s nothing to display at the moment.',
    filterMessage: 'Try adjusting your search or filters.',
  },
};

// ===========================================
// Size Configurations
// ===========================================

const sizeConfigs = {
  small: {
    container: 'py-8',
    iconWrapper: 'w-12 h-12',
    icon: 'w-6 h-6',
    title: 'text-base',
    message: 'text-sm max-w-xs',
  },
  default: {
    container: 'py-16',
    iconWrapper: 'w-20 h-20',
    icon: 'w-10 h-10',
    title: 'text-lg',
    message: 'text-sm max-w-md',
  },
  large: {
    container: 'py-24',
    iconWrapper: 'w-24 h-24',
    icon: 'w-12 h-12',
    title: 'text-xl',
    message: 'text-base max-w-lg',
  },
};

// ===========================================
// EmptyState Component
// ===========================================

export function EmptyState({
  variant,
  hasFilters = false,
  title,
  message,
  actionLabel,
  actionHref,
  onAction,
  icon,
  size = 'default',
}: EmptyStateProps) {
  const config = variantConfigs[variant];
  const sizeConfig = sizeConfigs[size];
  const Icon = icon || config.icon;

  // Determine content based on filter state
  const displayTitle = title || (hasFilters ? config.filterTitle : config.title);
  const displayMessage = message || (hasFilters ? config.filterMessage : config.message);
  const displayActionLabel = actionLabel || (!hasFilters ? config.actionLabel : undefined);
  const displayActionHref = actionHref || (!hasFilters ? config.actionHref : undefined);

  // Determine if we should show the action button
  const showAction = displayActionLabel && (displayActionHref || onAction);

  return (
    <div className={`text-center ${sizeConfig.container}`}>
      {/* Decorative background circle with icon */}
      <div className="relative mx-auto mb-6">
        {/* Outer decorative ring */}
        <div
          className={`${sizeConfig.iconWrapper} mx-auto rounded-full bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900 flex items-center justify-center shadow-sm border border-slate-200 dark:border-slate-700`}
        >
          <Icon className={`${sizeConfig.icon} text-slate-400 dark:text-slate-500`} />
        </div>
        {/* Subtle glow effect */}
        <div
          className={`absolute inset-0 ${sizeConfig.iconWrapper} mx-auto rounded-full bg-luminous-500/5 dark:bg-luminous-400/5 blur-xl -z-10`}
        />
      </div>

      {/* Title */}
      <h3 className={`${sizeConfig.title} font-semibold text-slate-900 dark:text-white mb-2`}>
        {displayTitle}
      </h3>

      {/* Message */}
      <p className={`${sizeConfig.message} mx-auto text-slate-500 dark:text-slate-400 mb-6`}>
        {displayMessage}
      </p>

      {/* Action Button */}
      {showAction && (
        <>
          {displayActionHref ? (
            <Link
              href={displayActionHref}
              className="luminous-button-primary inline-flex items-center gap-2"
            >
              <PlusIcon className="h-5 w-5" />
              {displayActionLabel}
            </Link>
          ) : onAction ? (
            <button
              onClick={onAction}
              className="luminous-button-primary inline-flex items-center gap-2"
            >
              <PlusIcon className="h-5 w-5" />
              {displayActionLabel}
            </button>
          ) : null}
        </>
      )}

      {/* Optional hint for filtered state */}
      {hasFilters && !showAction && (
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-4">
          Tip: Clear your filters to see all items
        </p>
      )}
    </div>
  );
}

// ===========================================
// Preset Empty States (convenience exports)
// ===========================================

export function EmptyCoursesState({ hasFilters = false }: { hasFilters?: boolean }) {
  return <EmptyState variant="courses" hasFilters={hasFilters} />;
}

export function EmptyProgramsState({ hasFilters = false }: { hasFilters?: boolean }) {
  return <EmptyState variant="programs" hasFilters={hasFilters} />;
}

export function EmptyDraftsState({ hasFilters = false }: { hasFilters?: boolean }) {
  return <EmptyState variant="drafts" hasFilters={hasFilters} />;
}

export function EmptyApprovalsState({ message }: { message?: string }) {
  return <EmptyState variant="approvals" message={message} />;
}

export function EmptySearchState() {
  return <EmptyState variant="search" hasFilters />;
}

export default EmptyState;
