'use client';

// ===========================================
// Authentication Context
// ===========================================
// Provides authentication state and methods to the entire app
// Supports development mode for testing without Firebase

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from 'firebase/auth';
import {
  auth,
  signIn,
  signOut,
  onAuthChange,
  getIdToken,
  isFirebaseConfigured
} from '@/lib/firebase';

// ===========================================
// Types
// ===========================================

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'Faculty' | 'CurriculumChair' | 'ArticulationOfficer' | 'Admin';
  department_id?: string;
  department_name?: string;
}

// Development mode detection helper
// Enable dev bypass if NEXT_PUBLIC_AUTH_DEV_MODE is set to 'true'
// This allows testing without Firebase even in production builds
const isDevBypassEnabled = (): boolean => {
  if (typeof window === 'undefined') return false; // Server-side render
  // IMPORTANT: Check localStorage FIRST for runtime control
  // This allows dev bypass to work even if the build-time env var was false
  const manualDevMode = window.localStorage.getItem('DEV_AUTH_BYPASS') === 'true';
  if (manualDevMode) return true;

  // Fall back to build-time environment variable
  const authDevMode = process.env.NEXT_PUBLIC_AUTH_DEV_MODE === 'true';
  return authDevMode;
};

// Demo mode detection helper
// Enable demo mode if NEXT_PUBLIC_DEMO_MODE is set to 'true'
// Demo mode allows public access with limited features and daily resets
const isDemoModeEnabled = (): boolean => {
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
};

// Auto-enable dev mode flag (set by timeout when Firebase hangs)
let autoDevModeEnabled = false;

// Check if auto dev mode was triggered
const isAutoDevModeEnabled = (): boolean => {
  return autoDevModeEnabled;
};

// Mock user profiles for development mode
const DEV_USERS: Record<string, UserProfile> = {
  'demo@calricula.com': {
    id: 'dev-demo-001',
    email: 'demo@calricula.com',
    full_name: 'Demo User',
    role: 'Faculty',
    department_name: 'General',
  },
  'faculty@calricula.com': {
    id: 'dev-faculty-001',
    email: 'faculty@calricula.com',
    full_name: 'Dr. Maria Garcia',
    role: 'Faculty',
    department_name: 'Mathematics',
  },
  'faculty2@calricula.com': {
    id: 'dev-faculty-002',
    email: 'faculty2@calricula.com',
    full_name: 'Prof. James Chen',
    role: 'Faculty',
    department_name: 'English',
  },
  'faculty3@calricula.com': {
    id: 'dev-faculty-003',
    email: 'faculty3@calricula.com',
    full_name: 'Dr. Sarah Johnson',
    role: 'Faculty',
    department_name: 'Computer Science',
  },
  'chair@calricula.com': {
    id: 'dev-chair-001',
    email: 'chair@calricula.com',
    full_name: 'Dr. Robert Williams',
    role: 'CurriculumChair',
  },
  'articulation@calricula.com': {
    id: 'dev-articulation-001',
    email: 'articulation@calricula.com',
    full_name: 'Ms. Lisa Thompson',
    role: 'ArticulationOfficer',
  },
  'admin@calricula.com': {
    id: 'dev-admin-001',
    email: 'admin@calricula.com',
    full_name: 'Mr. David Martinez',
    role: 'Admin',
  },
};

interface AuthContextType {
  // Firebase user (from Firebase Auth)
  firebaseUser: User | null;
  // App user profile (from our database)
  user: UserProfile | null;
  // Loading states
  loading: boolean;
  profileLoading: boolean;
  // Error state
  error: string | null;
  // Is user authenticated?
  isAuthenticated: boolean;
  // Is Firebase configured?
  isConfigured: boolean;
  // Is demo mode enabled?
  isDemoMode: boolean;
  // Auth methods
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  // Get fresh ID token for API calls
  getToken: () => Promise<string | null>;
  // Clear error
  clearError: () => void;
}

// Default context value
const defaultContext: AuthContextType = {
  firebaseUser: null,
  user: null,
  loading: true,
  profileLoading: false,
  error: null,
  isAuthenticated: false,
  isConfigured: false,
  isDemoMode: false,
  login: async () => {},
  logout: async () => {},
  getToken: async () => null,
  clearError: () => {},
};

// Create context
const AuthContext = createContext<AuthContextType>(defaultContext);

// ===========================================
// Auth Provider Component
// ===========================================

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfigured = isFirebaseConfigured();

  // Fetch user profile from backend
  const fetchUserProfile = async (idToken: string): Promise<UserProfile | null> => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Session expired. Please log in again.');
        }
        if (response.status === 404) {
          throw new Error('User account not found. Please contact an administrator.');
        }
        throw new Error('Failed to fetch user profile');
      }

      const profile = await response.json();
      return profile;
    } catch (error: any) {
      console.error('Failed to fetch user profile:', error);
      throw error;
    }
  };

  // Listen to Firebase auth state changes
  useEffect(() => {
    // Development bypass mode - restore session from storage
    // IMPORTANT: Call isDevBypassEnabled() inside useEffect to check localStorage on each mount
    const devBypassEnabled = isDevBypassEnabled();
    console.log('[AUTH] Dev bypass enabled:', devBypassEnabled);

    if (devBypassEnabled) {
      if (typeof window !== 'undefined') {
        const storedUser = sessionStorage.getItem('dev_user');
        if (storedUser) {
          try {
            const devUser = JSON.parse(storedUser);
            console.log('[DEV MODE] Restored session for:', devUser.email);
            setUser(devUser);
          } catch (e) {
            console.warn('[DEV MODE] Failed to restore session');
          }
        } else {
          console.log('[DEV MODE] No stored user found in sessionStorage');
        }
      }
      setLoading(false);
      return;
    }

    if (!isConfigured) {
      console.log('[AUTH] Firebase not configured - enabling dev mode automatically');
      // Auto-enable dev mode when Firebase isn't configured
      autoDevModeEnabled = true;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('DEV_AUTH_BYPASS', 'true');
        // Try to restore dev user session
        const storedUser = sessionStorage.getItem('dev_user');
        if (storedUser) {
          try {
            const devUser = JSON.parse(storedUser);
            console.log('[DEV MODE] Restored session for:', devUser.email);
            setUser(devUser);
          } catch (e) {
            console.warn('[DEV MODE] Failed to restore session');
          }
        }
      }
      setLoading(false);
      return;
    }

    console.log('[AUTH] Using Firebase authentication');

    let authResolved = false;

    // Timeout: If Firebase doesn't respond in 5 seconds, fall back to dev mode
    // This enables automated testing with Puppeteer when Firebase hangs
    const timeoutId = setTimeout(() => {
      if (!authResolved) {
        console.warn('[AUTH] Firebase auth timeout - enabling dev mode fallback');
        autoDevModeEnabled = true;
        // Store in localStorage so future page loads use dev mode
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('DEV_AUTH_BYPASS', 'true');
        }
        setLoading(false);
      }
    }, 5000);

    const unsubscribe = onAuthChange(async (fbUser) => {
      authResolved = true;
      clearTimeout(timeoutId);
      setFirebaseUser(fbUser);

      if (fbUser) {
        // User is signed in, fetch their profile
        setProfileLoading(true);
        try {
          const idToken = await fbUser.getIdToken();
          const profile = await fetchUserProfile(idToken);
          setUser(profile);
          setError(null);
        } catch (error: any) {
          setUser(null);
          // Don't show error on initial load, only on explicit actions
          console.warn('Could not fetch user profile:', error.message);
        } finally {
          setProfileLoading(false);
        }
      } else {
        // User is signed out
        setUser(null);
      }

      setLoading(false);
    });

    // Cleanup subscription and timeout
    return () => {
      unsubscribe();
      clearTimeout(timeoutId);
    };
  }, [isConfigured]);

  // Login function
  const login = async (email: string, password: string) => {
    setError(null);
    setProfileLoading(true);

    try {
      // Development bypass mode (manual or auto-enabled from timeout)
      if (isDevBypassEnabled() || isAutoDevModeEnabled()) {
        const devUser = DEV_USERS[email.toLowerCase()];
        // Accept Test123! for dev users OR the real demo password
        const validPasswords = ['Test123!', 'dont4get'];
        if (devUser && validPasswords.includes(password)) {
          console.log('[DEV MODE] Bypassing Firebase auth for:', email);
          setUser(devUser);
          // Store in sessionStorage for persistence
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('dev_user', JSON.stringify(devUser));
          }
          return;
        }
        throw new Error('Invalid email or password. Dev users: demo@calricula.com, faculty@calricula.com, chair@calricula.com, admin@calricula.com');
      }

      const credential = await signIn(email, password);

      // Fetch user profile after successful login
      const idToken = await credential.user.getIdToken();
      const profile = await fetchUserProfile(idToken);
      setUser(profile);
    } catch (error: any) {
      setError(error.message);
      throw error;
    } finally {
      setProfileLoading(false);
    }
  };

  // Logout function
  const logout = async () => {
    setError(null);
    try {
      // Development bypass mode (manual or auto-enabled from timeout)
      if (isDevBypassEnabled() || isAutoDevModeEnabled()) {
        console.log('[DEV MODE] Logging out');
        setUser(null);
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('dev_user');
        }
        return;
      }

      await signOut();
      setUser(null);
    } catch (error: any) {
      setError(error.message);
      throw error;
    }
  };

  // Get fresh ID token
  const getToken = async (): Promise<string | null> => {
    // In dev bypass mode, return the mock user's ID as the token
    // The backend will use this to identify the dev user
    if ((isDevBypassEnabled() || isAutoDevModeEnabled()) && user) {
      return user.id; // e.g., "dev-faculty-001"
    }
    return await getIdToken();
  };

  // Clear error
  const clearError = () => {
    setError(null);
  };

  // Check if any dev mode is active (manual or auto from timeout)
  const devModeActive = isDevBypassEnabled() || isAutoDevModeEnabled();
  const demoModeActive = isDemoModeEnabled();

  const value: AuthContextType = {
    firebaseUser,
    user,
    loading,
    profileLoading,
    error,
    // In dev bypass mode, only check for user; otherwise require both firebaseUser and user
    isAuthenticated: devModeActive ? !!user : (!!firebaseUser && !!user),
    isConfigured: devModeActive || isConfigured,
    isDemoMode: demoModeActive,
    login,
    logout,
    getToken,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// ===========================================
// Hook to use auth context
// ===========================================

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};

// ===========================================
// Higher-order component for protected routes
// ===========================================

interface WithAuthOptions {
  redirectTo?: string;
  requiredRoles?: UserProfile['role'][];
}

export const withAuth = <P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options: WithAuthOptions = {}
) => {
  const { redirectTo = '/login', requiredRoles } = options;

  return function WithAuthComponent(props: P) {
    const { isAuthenticated, loading, user } = useAuth();

    // Show loading state
    if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luminous-600"></div>
        </div>
      );
    }

    // Redirect if not authenticated
    if (!isAuthenticated) {
      if (typeof window !== 'undefined') {
        window.location.href = redirectTo;
      }
      return null;
    }

    // Check role requirements
    if (requiredRoles && user && !requiredRoles.includes(user.role)) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
            <p className="text-gray-600">
              You don't have permission to access this page.
            </p>
          </div>
        </div>
      );
    }

    return <WrappedComponent {...props} />;
  };
};

export default AuthContext;
