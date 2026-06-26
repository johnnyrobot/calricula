// ===========================================
// Firebase Client Configuration
// ===========================================
// Initializes Firebase for frontend authentication

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
  Auth
} from 'firebase/auth';

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

// Validate required configuration
const validateConfig = (): boolean => {
  const required = ['apiKey', 'authDomain', 'projectId'] as const;
  const missing = required.filter(key => !firebaseConfig[key]);

  if (missing.length > 0) {
    console.warn(
      `Firebase configuration: Missing environment variables: ${missing
        .map(key => `NEXT_PUBLIC_FIREBASE_${key.toUpperCase().replace(/([A-Z])/g, '_$1')}`)
        .join(', ')}`
    );
    return false;
  }

  // Check for placeholder values that indicate Firebase isn't properly configured
  const placeholders = ['your-project-id', 'your-project', 'your_project', 'placeholder', 'example'];
  const projectId = firebaseConfig.projectId?.toLowerCase() || '';
  const authDomain = firebaseConfig.authDomain?.toLowerCase() || '';

  if (placeholders.some(p => projectId.includes(p) || authDomain.includes(p))) {
    console.warn('Firebase configuration: Detected placeholder values - Firebase auth disabled');
    return false;
  }

  return true;
};

// Initialize Firebase app (singleton pattern)
let app: FirebaseApp | null = null;
let auth: Auth | null = null;

const initializeFirebase = (): { app: FirebaseApp | null; auth: Auth | null } => {
  // Only initialize on client side
  if (typeof window === 'undefined') {
    return { app: null, auth: null };
  }

  // Check if already initialized
  if (getApps().length > 0) {
    app = getApps()[0];
    auth = getAuth(app);
    return { app, auth };
  }

  // Validate configuration
  if (!validateConfig()) {
    console.warn('Firebase not initialized due to missing configuration');
    return { app: null, auth: null };
  }

  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    console.log('Firebase initialized successfully');
    return { app, auth };
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
    return { app: null, auth: null };
  }
};

// Initialize on module load
const { app: firebaseApp, auth: firebaseAuth } = initializeFirebase();

// Export auth instance
export { firebaseAuth as auth };

// ===========================================
// Authentication Functions
// ===========================================

/**
 * Sign in with email and password
 * @param email User's email address
 * @param password User's password
 * @returns Promise with user credentials
 */
export const signIn = async (email: string, password: string) => {
  if (!firebaseAuth) {
    throw new Error('Firebase authentication is not configured');
  }

  try {
    const userCredential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    return userCredential;
  } catch (error) {
    // Provide user-friendly error messages
    const firebaseErr = error as { code?: string; message?: string };
    const errorCode = firebaseErr?.code || 'unknown';
    const errorMessages: Record<string, string> = {
      'auth/invalid-email': 'Invalid email address format.',
      'auth/user-disabled': 'This account has been disabled.',
      'auth/user-not-found': 'No account found with this email.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/invalid-credential': 'Invalid email or password.',
      'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
    };

    throw new Error(errorMessages[errorCode] || `Authentication failed: ${firebaseErr.message}`);
  }
};

/**
 * Sign out current user
 */
export const signOut = async () => {
  if (!firebaseAuth) {
    throw new Error('Firebase authentication is not configured');
  }

  try {
    await firebaseSignOut(firebaseAuth);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Sign out failed: ${message}`);
  }
};

/**
 * Get the current user's ID token for API authentication
 * @returns Promise with ID token string or null
 */
export const getIdToken = async (): Promise<string | null> => {
  if (!firebaseAuth?.currentUser) {
    return null;
  }

  try {
    return await firebaseAuth.currentUser.getIdToken();
  } catch (error) {
    console.error('Failed to get ID token:', error);
    return null;
  }
};

/**
 * Subscribe to authentication state changes
 * @param callback Function called when auth state changes
 * @returns Unsubscribe function
 */
export const onAuthChange = (callback: (user: User | null) => void) => {
  if (!firebaseAuth) {
    // Return a no-op unsubscribe function
    return () => {};
  }

  return onAuthStateChanged(firebaseAuth, callback);
};

/**
 * Get current user synchronously (may be null if not yet initialized)
 */
export const getCurrentUser = (): User | null => {
  return firebaseAuth?.currentUser || null;
};

/**
 * Check if Firebase is properly configured
 */
export const isFirebaseConfigured = (): boolean => {
  return firebaseAuth !== null;
};
