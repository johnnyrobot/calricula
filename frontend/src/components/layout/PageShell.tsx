'use client';

// ===========================================
// PageShell Component - Main Layout with Sidebar
// ===========================================
// Provides the main app shell with gradient sidebar navigation

import React, { useState, useEffect, useCallback, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AcademicCapIcon,
  HomeIcon,
  DocumentTextIcon,
  FolderIcon,
  CheckCircleIcon,
  Bars3Icon,
  XMarkIcon,
  ArrowRightOnRectangleIcon,
  UserCircleIcon,
  BookOpenIcon,
  BriefcaseIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { NotificationBell } from '@/components/notifications';
import { ThemeToggle } from '@/components/theme';
import {
  HomeIcon as HomeIconSolid,
  DocumentTextIcon as DocumentTextIconSolid,
  FolderIcon as FolderIconSolid,
  CheckCircleIcon as CheckCircleIconSolid,
  BookOpenIcon as BookOpenIconSolid,
  BriefcaseIcon as BriefcaseIconSolid,
  ChartBarIcon as ChartBarIconSolid,
} from '@heroicons/react/24/solid';
import { useAuth, UserProfile } from '@/contexts/AuthContext';
import { api } from '@/lib/api';

// ===========================================
// Types
// ===========================================

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  iconActive: React.ComponentType<{ className?: string }>;
  roles?: UserProfile['role'][]; // Only show to these roles
  showBadge?: boolean; // Show pending count badge
}

interface PageShellProps {
  children: ReactNode;
}

// ===========================================
// Navigation Configuration
// ===========================================

const navigation: NavItem[] = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: HomeIcon,
    iconActive: HomeIconSolid,
  },
  {
    name: 'Courses',
    href: '/courses',
    icon: DocumentTextIcon,
    iconActive: DocumentTextIconSolid,
  },
  {
    name: 'Programs',
    href: '/programs',
    icon: FolderIcon,
    iconActive: FolderIconSolid,
  },
  {
    name: 'Library',
    href: '/library',
    icon: BookOpenIcon,
    iconActive: BookOpenIconSolid,
  },
  {
    name: 'LMI Data',
    href: '/lmi-data',
    icon: BriefcaseIcon,
    iconActive: BriefcaseIconSolid,
  },
  {
    name: 'BLS Data',
    href: '/bls-data',
    icon: ChartBarIcon,
    iconActive: ChartBarIconSolid,
  },
  {
    name: 'Approvals',
    href: '/approvals',
    icon: CheckCircleIcon,
    iconActive: CheckCircleIconSolid,
    roles: ['CurriculumChair', 'ArticulationOfficer', 'Admin'],
    showBadge: true,
  },
];

// ===========================================
// Sidebar Component
// ===========================================

interface SidebarProps {
  user: UserProfile | null;
  currentPath: string;
  onLogout: () => void;
  mobile?: boolean;
  onClose?: () => void;
  pendingCount?: number;
}

const Sidebar: React.FC<SidebarProps> = ({
  user,
  currentPath,
  onLogout,
  mobile = false,
  onClose,
  pendingCount = 0,
}) => {
  // Filter navigation items based on user role
  const filteredNav = navigation.filter((item) => {
    if (!item.roles) return true;
    if (!user) return false;
    return item.roles.includes(user.role) || user.role === 'Admin';
  });

  return (
    <aside className={`flex flex-col h-full ${mobile ? '' : 'luminous-sidebar'}`} aria-label="Sidebar Navigation">
      {/* Logo Section */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
        <AcademicCapIcon className="h-8 w-8 text-white" />
        <span className="text-xl font-bold text-white">Calricula</span>
        {mobile && onClose && (
          <button
            onClick={onClose}
            className="ml-auto p-1 rounded-lg hover:bg-white/10 text-white
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            aria-label="Close menu"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {filteredNav.map((item) => {
          const isActive = currentPath === item.href || currentPath.startsWith(`${item.href}/`);
          const Icon = isActive ? item.iconActive : item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`${isActive ? 'luminous-nav-item-active' : 'luminous-nav-item'} relative`}
              onClick={mobile ? onClose : undefined}
            >
              <Icon className="h-5 w-5" />
              <span>{item.name}</span>
              {/* Pending count badge for approvals */}
              {item.showBadge && pendingCount > 0 && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-xs font-bold rounded-full bg-red-500 text-white">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Profile Section */}
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-white/20">
            <UserCircleIcon className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {user?.full_name || 'User'}
            </p>
            <p className="text-xs text-white/60 truncate">
              {user?.role || 'Faculty'}
            </p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg
                     bg-white/10 text-white/90 hover:bg-white/20 transition-colors text-sm
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          <ArrowRightOnRectangleIcon className="h-4 w-4" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
};

// ===========================================
// PageShell Component
// ===========================================

const PageShell: React.FC<PageShellProps> = ({ children }) => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, isAuthenticated, logout, getToken } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Check if user is a reviewer
  const isReviewer = user && ['CurriculumChair', 'ArticulationOfficer', 'Admin'].includes(user.role);

  // Fetch pending approval count for reviewers
  useEffect(() => {
    const fetchPendingCount = async () => {
      if (!isReviewer) return;

      try {
        const token = await getToken();
        if (token) {
          api.setToken(token);
        }
        const counts = await api.getApprovalCounts();
        setPendingCount(counts.pending_my_review);
      } catch (err) {
        console.error('Failed to fetch approval counts:', err);
      }
    };

    if (isAuthenticated && isReviewer) {
      fetchPendingCount();
      // Refresh count every 5 minutes
      const interval = setInterval(fetchPendingCount, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, isReviewer, getToken]);

  // Handle logout
  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // Redirect if not authenticated (using useEffect to avoid setState during render)
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
    }
  }, [loading, isAuthenticated, router]);

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luminous-600" />
          <p className="text-slate-600 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Show loading while redirecting
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luminous-600" />
          <p className="text-slate-600 dark:text-slate-400">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Skip to main content link for keyboard users */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 luminous-gradient transform transition-transform duration-300 ease-in-out lg:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar
          user={user}
          currentPath={pathname}
          onLogout={handleLogout}
          mobile={true}
          onClose={() => setSidebarOpen(false)}
          pendingCount={pendingCount}
        />
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar user={user} currentPath={pathname} onLogout={handleLogout} pendingCount={pendingCount} />
      </div>

      {/* Main Content Area */}
      <div className="lg:pl-64">
        {/* Desktop Header - shown only on large screens */}
        <header className="hidden lg:flex sticky top-0 z-30 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 h-16 items-center justify-end px-6 gap-2">
          <ThemeToggle />
          <NotificationBell />
        </header>

        {/* Mobile Header */}
        <header className="sticky top-0 z-30 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 lg:hidden">
          <div className="flex items-center justify-between h-16 px-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500 focus-visible:ring-offset-2"
              aria-label="Open menu"
            >
              <Bars3Icon className="h-6 w-6" />
            </button>
            <div className="flex items-center gap-2">
              <AcademicCapIcon className="h-7 w-7 text-luminous-600" />
              <span className="text-lg font-bold text-slate-900 dark:text-white">
                Calricula
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle variant="simple" size="sm" />
              <NotificationBell />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main id="main-content" className="min-h-[calc(100vh-4rem)] lg:min-h-screen" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default PageShell;
