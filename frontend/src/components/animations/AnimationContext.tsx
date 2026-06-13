'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface AnimationContextType {
  /** Whether the user prefers reduced motion */
  prefersReducedMotion: boolean;
  /** Whether animations are enabled (respects user preference) */
  animationsEnabled: boolean;
  /** Override animations (for testing or user preference) */
  setAnimationsEnabled: (enabled: boolean) => void;
}

const AnimationContext = createContext<AnimationContextType | undefined>(undefined);

export function AnimationProvider({ children }: { children: ReactNode }) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [animationsOverride, setAnimationsOverride] = useState<boolean | null>(null);

  useEffect(() => {
    // Check for reduced motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const animationsEnabled = animationsOverride !== null
    ? animationsOverride
    : !prefersReducedMotion;

  const setAnimationsEnabled = (enabled: boolean) => {
    setAnimationsOverride(enabled);
  };

  return (
    <AnimationContext.Provider
      value={{
        prefersReducedMotion,
        animationsEnabled,
        setAnimationsEnabled
      }}
    >
      {children}
    </AnimationContext.Provider>
  );
}

export function useAnimation() {
  const context = useContext(AnimationContext);
  if (context === undefined) {
    // Provide safe defaults when used outside provider
    return {
      prefersReducedMotion: false,
      animationsEnabled: true,
      setAnimationsEnabled: () => {},
    };
  }
  return context;
}
