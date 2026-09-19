'use client';

// ===========================================
// Login Page - CUR-34
// ===========================================
// Single sign-in entry point.
//   'logto' — one button that hands the browser to the server-side /sign-in
//             route, which starts the OIDC authorization-code flow.
//   'dev'   — the local identity picker (email + one of the documented dev
//             passwords); no real credential is ever checked here.
//   'none'  — nothing is configured; no credential form is offered.

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  AcademicCapIcon,
  EyeIcon,
  EyeSlashIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '@/contexts/AuthContext';

/** Messages for the `?error=` values the server-side auth routes redirect with. */
const REDIRECT_ERRORS: Record<string, string> = {
  // `/callback` could not complete the authorization-code exchange (cancelled
  // at the provider, state mismatch, expired code).
  callback:
    'Sign-in could not be completed. Please try again; if this keeps happening, contact an administrator.',
};

export default function LoginPage() {
  const router = useRouter();
  const { login, loading, mode, isAuthenticated, error: authError } = useAuth();

  // Form state (dev identity picker only)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Track if component is mounted to avoid hydration mismatch
  const [mounted, setMounted] = useState(false);
  // An error the server-side auth routes redirected here with (`?error=...`).
  // Read after mount, like `mounted`, so the server render never sees it.
  const [redirectError, setRedirectError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount flag to gate client-only redirect and avoid SSR hydration mismatch
    setMounted(true);
    const code = new URLSearchParams(window.location.search).get('error');
    if (code && REDIRECT_ERRORS[code]) setRedirectError(REDIRECT_ERRORS[code]);
  }, []);

  // Redirect if already authenticated (only after mount to avoid hydration issues)
  useEffect(() => {
    if (mounted && isAuthenticated && !loading) {
      router.push('/dashboard');
    }
  }, [mounted, isAuthenticated, loading, router]);

  // Handle dev identity picker submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(email, password);
      // Redirect to dashboard on success
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Errors raised by the provider flow (e.g. the demo-account gate) and by
  // the server-side auth routes (`?error=callback`) surface alongside form
  // errors.
  const shownError = error ?? authError ?? redirectError;

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 luminous-gradient items-center justify-center p-12">
        <div className="max-w-lg text-center">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div className="flex items-center gap-3">
              <AcademicCapIcon className="h-16 w-16 text-white" />
              <span className="text-5xl font-bold text-white">Calricula</span>
            </div>
          </div>

          {/* Tagline */}
          <h1 className="text-3xl font-bold text-white mb-4">
            Intelligent Curriculum Management
          </h1>
          <p className="text-lg text-white/80">
            AI-assisted Course Outline of Record creation with embedded
            compliance standards.
          </p>

          {/* Features Preview */}
          <div className="mt-12 space-y-4 text-left">
            <div className="flex items-center gap-3 text-white/90">
              <div className="w-2 h-2 bg-white rounded-full" />
              <span>Automatic CB code generation</span>
            </div>
            <div className="flex items-center gap-3 text-white/90">
              <div className="w-2 h-2 bg-white rounded-full" />
              <span>AI-powered SLO suggestions</span>
            </div>
            <div className="flex items-center gap-3 text-white/90">
              <div className="w-2 h-2 bg-white rounded-full" />
              <span>Streamlined approval workflow</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Sign in */}
      <main className="flex-1 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <div className="flex items-center gap-2">
              <AcademicCapIcon className="h-10 w-10 text-luminous-600" />
              <span className="text-3xl font-bold text-slate-900">
                Calricula
              </span>
            </div>
          </div>

          {/* Login Card */}
          <div className="luminous-card">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-slate-900">
                Welcome back
              </h2>
              <p className="mt-2 text-slate-600">
                Sign in to your account to continue
              </p>
            </div>

            {/* Not-configured warning - only after mount to avoid hydration mismatch */}
            {mounted && mode === 'none' && (
              <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200">
                <div className="flex gap-3">
                  <ExclamationCircleIcon className="h-5 w-5 text-amber-700 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-900">
                      Sign-in is not configured
                    </p>
                    <p className="text-sm text-amber-900 mt-1">
                      This deployment has no identity provider set up. Ask an
                      administrator to configure Logto single sign-on.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Error Message */}
            {shownError && (
              <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200" role="alert">
                <div className="flex gap-3">
                  <ExclamationCircleIcon className="h-5 w-5 text-red-700 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800">{shownError}</p>
                </div>
              </div>
            )}

            {/* Single sign-on: a plain link to the server route, so it works
                without JS and never carries a token in the URL. */}
            {mounted && mode === 'logto' && (
              <a
                href="/sign-in"
                className="w-full luminous-button-primary py-3 text-base"
              >
                Sign in with your college account
              </a>
            )}

            {/* Development identity picker */}
            {mounted && mode === 'dev' && (
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Email Field */}
                <div>
                  <label htmlFor="email" className="luminous-label">
                    Email address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isSubmitting}
                    className="luminous-input"
                    placeholder="you@laccd.edu"
                  />
                </div>

                {/* Password Field */}
                <div>
                  <label htmlFor="password" className="luminous-label">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isSubmitting}
                      className="luminous-input pr-10"
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-700"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeSlashIcon className="h-5 w-5" />
                      ) : (
                        <EyeIcon className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full luminous-button-primary py-3 text-base"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg
                        className="animate-spin h-5 w-5 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Signing in...
                    </span>
                  ) : (
                    'Sign in'
                  )}
                </button>

                <p className="text-sm text-slate-600">
                  Development mode: sign in as one of the seeded accounts
                  (faculty@, chair@, articulation@, admin@calricula.com).
                </p>
              </form>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
