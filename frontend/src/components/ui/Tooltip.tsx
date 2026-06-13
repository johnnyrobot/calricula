'use client';

// ===========================================
// Tooltip Component - Accessible Hover Tooltips
// ===========================================
// Provides helpful tooltips for complex fields with keyboard support

import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { QuestionMarkCircleIcon } from '@heroicons/react/24/outline';

// ===========================================
// Types
// ===========================================

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  /** The content to show in the tooltip */
  content: ReactNode;
  /** Optional custom trigger element. If not provided, uses a question mark icon */
  children?: ReactNode;
  /** Position of the tooltip relative to the trigger */
  position?: TooltipPosition;
  /** Additional class names for the tooltip container */
  className?: string;
  /** Max width of the tooltip */
  maxWidth?: string;
  /** Optional link to documentation */
  learnMoreUrl?: string;
  /** Label for learn more link */
  learnMoreLabel?: string;
}

interface InfoTooltipProps {
  /** The content to show in the tooltip */
  content: ReactNode;
  /** Position of the tooltip */
  position?: TooltipPosition;
  /** Size of the info icon */
  iconSize?: 'sm' | 'md' | 'lg';
  /** Optional link to documentation */
  learnMoreUrl?: string;
}

// ===========================================
// Position Styles
// ===========================================

const positionStyles: Record<TooltipPosition, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

const arrowStyles: Record<TooltipPosition, string> = {
  top: 'top-full left-1/2 -translate-x-1/2 border-t-slate-800 dark:border-t-slate-200 border-x-transparent border-b-transparent',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-800 dark:border-b-slate-200 border-x-transparent border-t-transparent',
  left: 'left-full top-1/2 -translate-y-1/2 border-l-slate-800 dark:border-l-slate-200 border-y-transparent border-r-transparent',
  right: 'right-full top-1/2 -translate-y-1/2 border-r-slate-800 dark:border-r-slate-200 border-y-transparent border-l-transparent',
};

const iconSizes = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

// ===========================================
// Tooltip Component
// ===========================================

export function Tooltip({
  content,
  children,
  position = 'top',
  className = '',
  maxWidth = '280px',
  learnMoreUrl,
  learnMoreLabel = 'Learn more',
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (isVisible || isFocused)) {
        setIsVisible(false);
        setIsFocused(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isVisible, isFocused]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsVisible(false);
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isVisible]);

  const showTooltip = isVisible || isFocused;

  return (
    <div className={`relative inline-flex ${className}`}>
      {/* Trigger */}
      <div
        ref={triggerRef}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        tabIndex={0}
        role="button"
        aria-describedby={showTooltip ? 'tooltip-content' : undefined}
        className="cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500 focus-visible:ring-offset-2 rounded-full"
      >
        {children || (
          <QuestionMarkCircleIcon className="h-5 w-5 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors" />
        )}
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div
          ref={tooltipRef}
          id="tooltip-content"
          role="tooltip"
          className={`absolute z-50 ${positionStyles[position]}`}
          style={{ maxWidth }}
        >
          {/* Tooltip Content */}
          <div className="bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-sm rounded-lg shadow-lg px-3 py-2">
            <div className="leading-relaxed">{content}</div>
            {learnMoreUrl && (
              <a
                href={learnMoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block mt-2 text-luminous-300 dark:text-luminous-600 hover:text-luminous-200 dark:hover:text-luminous-700 text-xs font-medium"
                onClick={(e) => e.stopPropagation()}
              >
                {learnMoreLabel} &rarr;
              </a>
            )}
          </div>
          {/* Arrow */}
          <div
            className={`absolute w-0 h-0 border-4 ${arrowStyles[position]}`}
          />
        </div>
      )}
    </div>
  );
}

// ===========================================
// InfoTooltip Component - Shorthand for info icons
// ===========================================

export function InfoTooltip({
  content,
  position = 'top',
  iconSize = 'md',
  learnMoreUrl,
}: InfoTooltipProps) {
  return (
    <Tooltip content={content} position={position} learnMoreUrl={learnMoreUrl}>
      <QuestionMarkCircleIcon
        className={`${iconSizes[iconSize]} text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors`}
      />
    </Tooltip>
  );
}

// ===========================================
// FieldLabel Component - Label with optional tooltip
// ===========================================

interface FieldLabelProps {
  /** The label text */
  label: string;
  /** Whether the field is required */
  required?: boolean;
  /** Tooltip content */
  tooltip?: ReactNode;
  /** Link to documentation */
  learnMoreUrl?: string;
  /** HTML for attribute */
  htmlFor?: string;
  /** Additional class names */
  className?: string;
}

export function FieldLabel({
  label,
  required = false,
  tooltip,
  learnMoreUrl,
  htmlFor,
  className = '',
}: FieldLabelProps) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-slate-700 dark:text-slate-300"
      >
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {tooltip && (
        <InfoTooltip
          content={tooltip}
          position="top"
          iconSize="sm"
          learnMoreUrl={learnMoreUrl}
        />
      )}
    </div>
  );
}

// ===========================================
// HelpText Component - Helper text under fields
// ===========================================

interface HelpTextProps {
  /** The help text content */
  children: ReactNode;
  /** Optional link to learn more */
  learnMoreUrl?: string;
  /** Label for learn more link */
  learnMoreLabel?: string;
  /** Additional class names */
  className?: string;
}

export function HelpText({
  children,
  learnMoreUrl,
  learnMoreLabel = 'Learn more',
  className = '',
}: HelpTextProps) {
  return (
    <p className={`text-xs text-slate-500 dark:text-slate-400 mt-1 ${className}`}>
      {children}
      {learnMoreUrl && (
        <>
          {' '}
          <a
            href={learnMoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-luminous-600 dark:text-luminous-400 hover:underline font-medium"
          >
            {learnMoreLabel}
          </a>
        </>
      )}
    </p>
  );
}

export default Tooltip;
