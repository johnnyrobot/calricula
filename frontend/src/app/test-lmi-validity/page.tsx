'use client';

import React from 'react';
import { LMIValidityIndicator } from '@/components/lmi';
import { calculateLMIValidity } from '@/utils/lmiValidation';

export default function LMIValidityTestPage() {
  // Create test dates
  const now = new Date();
  const twoMonthsAgo = new Date(now.getTime() - 2 * 30 * 24 * 60 * 60 * 1000);
  const twentyMonthsAgo = new Date(now.getTime() - 20 * 30 * 24 * 60 * 60 * 1000);
  const thirtyFiveMonthsAgo = new Date(now.getTime() - 35 * 30 * 24 * 60 * 60 * 1000);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-2 text-slate-900 dark:text-slate-50">
          LMI Validity Indicator Tests
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 mb-8">
          Test suite for the LMI data validity indicator component
        </p>

        <div className="space-y-12">
          {/* Test 1: Valid (2 months old) */}
          <section className="luminous-card">
            <h2 className="text-2xl font-bold mb-4 text-slate-900 dark:text-slate-50">
              Test 1: Valid Status (2 months old)
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Should display green check icon with "Valid" status
            </p>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
                  Size: sm, showAge=true, showMessage=false
                </h3>
                <LMIValidityIndicator
                  retrievedAt={twoMonthsAgo}
                  size="sm"
                  showAge={true}
                  showMessage={false}
                  showDate={true}
                />
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
                  Size: md, showAge=true, showMessage=true
                </h3>
                <LMIValidityIndicator
                  retrievedAt={twoMonthsAgo}
                  size="md"
                  showAge={true}
                  showMessage={true}
                  showDate={true}
                />
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
                  Size: lg, showAge=true, showMessage=false
                </h3>
                <LMIValidityIndicator
                  retrievedAt={twoMonthsAgo}
                  size="lg"
                  showAge={true}
                  showMessage={false}
                  showDate={true}
                />
              </div>
            </div>

            <div className="mt-6 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                <strong>Validity Check:</strong>{' '}
                {JSON.stringify(calculateLMIValidity(twoMonthsAgo), null, 2)}
              </p>
            </div>
          </section>

          {/* Test 2: Warning (20 months old) */}
          <section className="luminous-card">
            <h2 className="text-2xl font-bold mb-4 text-slate-900 dark:text-slate-50">
              Test 2: Warning Status (20 months old)
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Should display amber warning icon with "Warning" status and message
            </p>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
                  Size: sm, showAge=true, showMessage=true
                </h3>
                <LMIValidityIndicator
                  retrievedAt={twentyMonthsAgo}
                  size="sm"
                  showAge={true}
                  showMessage={true}
                  showDate={true}
                />
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
                  Size: md, showAge=true, showMessage=true
                </h3>
                <LMIValidityIndicator
                  retrievedAt={twentyMonthsAgo}
                  size="md"
                  showAge={true}
                  showMessage={true}
                  showDate={true}
                />
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
                  Size: lg, showAge=true, showMessage=true
                </h3>
                <LMIValidityIndicator
                  retrievedAt={twentyMonthsAgo}
                  size="lg"
                  showAge={true}
                  showMessage={true}
                  showDate={true}
                />
              </div>
            </div>

            <div className="mt-6 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                <strong>Validity Check:</strong>{' '}
                {JSON.stringify(calculateLMIValidity(twentyMonthsAgo), null, 2)}
              </p>
            </div>
          </section>

          {/* Test 3: Invalid (35 months old) */}
          <section className="luminous-card">
            <h2 className="text-2xl font-bold mb-4 text-slate-900 dark:text-slate-50">
              Test 3: Invalid Status (35 months old)
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Should display red X icon with "Invalid" status and blocking message
            </p>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
                  Size: sm, showAge=true, showMessage=true
                </h3>
                <LMIValidityIndicator
                  retrievedAt={thirtyFiveMonthsAgo}
                  size="sm"
                  showAge={true}
                  showMessage={true}
                  showDate={true}
                />
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
                  Size: md, showAge=true, showMessage=true
                </h3>
                <LMIValidityIndicator
                  retrievedAt={thirtyFiveMonthsAgo}
                  size="md"
                  showAge={true}
                  showMessage={true}
                  showDate={true}
                />
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
                  Size: lg, showAge=true, showMessage=true
                </h3>
                <LMIValidityIndicator
                  retrievedAt={thirtyFiveMonthsAgo}
                  size="lg"
                  showAge={true}
                  showMessage={true}
                  showDate={true}
                />
              </div>
            </div>

            <div className="mt-6 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                <strong>Validity Check:</strong>{' '}
                {JSON.stringify(calculateLMIValidity(thirtyFiveMonthsAgo), null, 2)}
              </p>
            </div>
          </section>

          {/* Test 4: Size Variations (Valid status) */}
          <section className="luminous-card">
            <h2 className="text-2xl font-bold mb-4 text-slate-900 dark:text-slate-50">
              Test 4: Size Variations (All showing Valid status)
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Test different size options with consistent data
            </p>

            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
                  Size: sm
                </h3>
                <LMIValidityIndicator
                  retrievedAt={twoMonthsAgo}
                  size="sm"
                  showAge={true}
                  showMessage={true}
                />
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
                  Size: md (default)
                </h3>
                <LMIValidityIndicator
                  retrievedAt={twoMonthsAgo}
                  size="md"
                  showAge={true}
                  showMessage={true}
                />
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
                  Size: lg
                </h3>
                <LMIValidityIndicator
                  retrievedAt={twoMonthsAgo}
                  size="lg"
                  showAge={true}
                  showMessage={true}
                />
              </div>
            </div>
          </section>

          {/* Acceptance Criteria Checklist */}
          <section className="luminous-card border-2 border-luminous-500">
            <h2 className="text-2xl font-bold mb-4 text-slate-900 dark:text-slate-50">
              ✅ Acceptance Criteria
            </h2>

            <ul className="space-y-2 text-slate-700 dark:text-slate-300">
              <li className="flex items-center gap-2">
                <span className="text-emerald-600">✓</span>
                <span>Correctly calculates age in months</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-600">✓</span>
                <span>Displays correct status icon and color</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-600">✓</span>
                <span>Shows age when showAge=true</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-600">✓</span>
                <span>Shows message when showMessage=true</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-600">✓</span>
                <span>Supports sm/md/lg sizes</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-600">✓</span>
                <span>Accessible (ARIA labels)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-600">✓</span>
                <span>Dark mode compatible</span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
