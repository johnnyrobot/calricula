'use client';

import Link from 'next/link';
import {
  AcademicCapIcon,
  DocumentTextIcon,
  SparklesIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';

export default function HomePage() {
  return (
    <div className="min-h-screen luminous-gradient">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative z-10">
          <div className="text-center">
            {/* Logo */}
            <div className="flex justify-center mb-4">
              <div className="flex items-center gap-3">
                <AcademicCapIcon className="h-12 w-12 text-white" />
                <span className="text-4xl font-bold text-white">Calricula</span>
              </div>
            </div>

            {/* Tagline */}
            <h1 className="text-5xl font-extrabold text-white mb-6">
              Intelligent Curriculum Management
            </h1>
            <p className="text-xl text-white/80 max-w-3xl mx-auto mb-8">
              AI-assisted Course Outline of Record (COR) creation with embedded
              compliance standards. Transform your curriculum
              development workflow.
            </p>

            {/* CTA Button */}
            <div className="flex justify-center">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg
                         bg-white text-luminous-600 font-semibold text-lg
                         hover:bg-slate-100 transition-colors shadow-lg"
              >
                Get Started
                <ArrowRightIcon className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Wave Decoration */}
        <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
          <svg
            viewBox="0 0 1440 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-auto"
          >
            <path
              d="M0 120L60 110C120 100 240 80 360 70C480 60 600 60 720 65C840 70 960 80 1080 85C1200 90 1320 90 1380 90L1440 90V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0V120Z"
              fill="#f8fafc"
            />
          </svg>
        </div>
      </div>

      {/* Features Section */}
      <section id="features" className="bg-slate-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-6">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">
              Powerful Features for Curriculum Development
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Everything you need to create compliant, high-quality Course
              Outlines of Record.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-luminous-100 mb-3">
                <SparklesIcon className="h-6 w-6 text-luminous-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                AI-Powered Assistance
              </h3>
              <p className="text-slate-600">
                Get intelligent suggestions for catalog descriptions, SLOs,
                and content outlines powered by Google Gemini.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-luminous-100 mb-3">
                <DocumentTextIcon className="h-6 w-6 text-luminous-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                Compliance Built-In
              </h3>
              <p className="text-slate-600">
                PCAH and Title 5 regulations embedded directly into the
                interface. CB codes generated automatically.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-luminous-100 mb-3">
                <AcademicCapIcon className="h-6 w-6 text-luminous-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                Streamlined Workflow
              </h3>
              <p className="text-slate-600">
                From draft to approval, track progress with visual status
                indicators and inline commenting.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AcademicCapIcon className="h-8 w-8" />
              <span className="text-xl font-bold">Calricula</span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-white/60">ACR:</span>
              <Link
                href="/accessibility/508"
                className="text-white/80 hover:text-white transition-colors underline-offset-2 hover:underline"
              >
                Section 508
              </Link>
              <Link
                href="/accessibility/wcag"
                className="text-white/80 hover:text-white transition-colors underline-offset-2 hover:underline"
              >
                WCAG
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
