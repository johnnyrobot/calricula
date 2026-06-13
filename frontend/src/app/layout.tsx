import type { Metadata } from 'next';
import '@/styles/globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { ToastProvider } from '@/components/toast';
import { ConfirmDialogProvider } from '@/components/confirm-dialog';
import { ErrorBoundary } from '@/components/error';
import { AnimationProvider } from '@/components/animations';

export const metadata: Metadata = {
  title: 'Calricula - Intelligent Curriculum Management',
  description:
    'AI-assisted Curriculum Management System for creating, modifying, and approving Course Outlines of Record (CORs) and Programs.',
  keywords: [
    'curriculum',
    'course outline',
    'COR',
    'community college',
    'education',
    'LACCD',
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 dark:bg-slate-900 antialiased">
        <ErrorBoundary>
          <ThemeProvider>
            <AnimationProvider>
              <AuthProvider>
                <ToastProvider>
                  <ConfirmDialogProvider>
                    {children}
                  </ConfirmDialogProvider>
                </ToastProvider>
              </AuthProvider>
            </AnimationProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
