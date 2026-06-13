'use client';

import React from 'react';
import {
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  ServerStackIcon,
  WifiIcon,
  ArrowPathIcon,
  HomeIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  onGoBack?: () => void;
  onGoHome?: () => void;
  showRetry?: boolean;
  showGoBack?: boolean;
  showGoHome?: boolean;
}

/**
 * NotFoundError - 404 Not Found error state
 */
export function NotFoundError({
  title = 'Page Not Found',
  message = "The page you're looking for doesn't exist or has been moved.",
  onGoBack,
  onGoHome,
  showGoBack = true,
  showGoHome = true,
}: ErrorStateProps) {
  const handleGoBack = () => {
    if (onGoBack) {
      onGoBack();
    } else if (typeof window !== 'undefined') {
      window.history.back();
    }
  };

  const handleGoHome = () => {
    if (onGoHome) {
      onGoHome();
    } else if (typeof window !== 'undefined') {
      window.location.href = '/dashboard';
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        {/* 404 Icon */}
        <div className="mx-auto w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
          <MagnifyingGlassIcon className="w-10 h-10 text-slate-400 dark:text-slate-500" />
        </div>

        {/* Large 404 Text */}
        <p className="text-6xl font-bold text-slate-200 dark:text-slate-700 mb-4">404</p>

        {/* Error Message */}
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">{title}</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-8">{message}</p>

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-3">
          {showGoBack && (
            <button
              onClick={handleGoBack}
              className="luminous-button-secondary inline-flex items-center gap-2"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              Go Back
            </button>
          )}
          {showGoHome && (
            <button
              onClick={handleGoHome}
              className="luminous-button-primary inline-flex items-center gap-2"
            >
              <HomeIcon className="w-4 h-4" />
              Go to Dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * ServerError - 500 Internal Server Error state
 */
export function ServerError({
  title = 'Server Error',
  message = 'Something went wrong on our end. Our team has been notified and is working on it.',
  onRetry,
  onGoHome,
  showRetry = true,
  showGoHome = true,
}: ErrorStateProps) {
  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  const handleGoHome = () => {
    if (onGoHome) {
      onGoHome();
    } else if (typeof window !== 'undefined') {
      window.location.href = '/dashboard';
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        {/* Server Icon */}
        <div className="mx-auto w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6">
          <ServerStackIcon className="w-10 h-10 text-red-600 dark:text-red-400" />
        </div>

        {/* Large 500 Text */}
        <p className="text-6xl font-bold text-red-100 dark:text-red-900/50 mb-4">500</p>

        {/* Error Message */}
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">{title}</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-8">{message}</p>

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-3">
          {showRetry && (
            <button
              onClick={handleRetry}
              className="luminous-button-secondary inline-flex items-center gap-2"
            >
              <ArrowPathIcon className="w-4 h-4" />
              Try Again
            </button>
          )}
          {showGoHome && (
            <button
              onClick={handleGoHome}
              className="luminous-button-primary inline-flex items-center gap-2"
            >
              <HomeIcon className="w-4 h-4" />
              Go to Dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * NetworkError - Network/Connection error state
 */
export function NetworkError({
  title = 'Connection Lost',
  message = "Unable to connect to the server. Please check your internet connection and try again.",
  onRetry,
  showRetry = true,
}: ErrorStateProps) {
  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        {/* Network Icon */}
        <div className="mx-auto w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-6">
          <WifiIcon className="w-10 h-10 text-amber-600 dark:text-amber-400" />
        </div>

        {/* Error Message */}
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">{title}</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-8">{message}</p>

        {/* Retry Button */}
        {showRetry && (
          <button
            onClick={handleRetry}
            className="luminous-button-primary inline-flex items-center gap-2"
          >
            <ArrowPathIcon className="w-4 h-4" />
            Retry Connection
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * GenericError - Generic error state for unspecified errors
 */
export function GenericError({
  title = 'Something went wrong',
  message = 'An unexpected error occurred. Please try again.',
  onRetry,
  onGoHome,
  showRetry = true,
  showGoHome = true,
}: ErrorStateProps) {
  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  const handleGoHome = () => {
    if (onGoHome) {
      onGoHome();
    } else if (typeof window !== 'undefined') {
      window.location.href = '/dashboard';
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        {/* Error Icon */}
        <div className="mx-auto w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6">
          <ExclamationTriangleIcon className="w-10 h-10 text-red-600 dark:text-red-400" />
        </div>

        {/* Error Message */}
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">{title}</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-8">{message}</p>

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-3">
          {showRetry && (
            <button
              onClick={handleRetry}
              className="luminous-button-secondary inline-flex items-center gap-2"
            >
              <ArrowPathIcon className="w-4 h-4" />
              Try Again
            </button>
          )}
          {showGoHome && (
            <button
              onClick={handleGoHome}
              className="luminous-button-primary inline-flex items-center gap-2"
            >
              <HomeIcon className="w-4 h-4" />
              Go to Dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * AccessDeniedError - 403 Forbidden error state
 */
export function AccessDeniedError({
  title = 'Access Denied',
  message = "You don't have permission to view this page. Please contact your administrator if you believe this is a mistake.",
  onGoBack,
  onGoHome,
  showGoBack = true,
  showGoHome = true,
}: ErrorStateProps) {
  const handleGoBack = () => {
    if (onGoBack) {
      onGoBack();
    } else if (typeof window !== 'undefined') {
      window.history.back();
    }
  };

  const handleGoHome = () => {
    if (onGoHome) {
      onGoHome();
    } else if (typeof window !== 'undefined') {
      window.location.href = '/dashboard';
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        {/* Lock Icon */}
        <div className="mx-auto w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-6">
          <svg
            className="w-10 h-10 text-amber-600 dark:text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
        </div>

        {/* Large 403 Text */}
        <p className="text-6xl font-bold text-amber-100 dark:text-amber-900/50 mb-4">403</p>

        {/* Error Message */}
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">{title}</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-8">{message}</p>

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-3">
          {showGoBack && (
            <button
              onClick={handleGoBack}
              className="luminous-button-secondary inline-flex items-center gap-2"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              Go Back
            </button>
          )}
          {showGoHome && (
            <button
              onClick={handleGoHome}
              className="luminous-button-primary inline-flex items-center gap-2"
            >
              <HomeIcon className="w-4 h-4" />
              Go to Dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default {
  NotFoundError,
  ServerError,
  NetworkError,
  GenericError,
  AccessDeniedError,
};
