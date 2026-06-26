'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'calricula-theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  // Get system preference
  // Academic theme is light-only ("dark parchment" is inauthentic to the
  // register), so system preference always resolves to light.
  const getSystemTheme = (): 'light' | 'dark' => 'light';

  // Apply theme to document. The academic redesign is light-only: the `dark`
  // class is never applied, regardless of the requested/stored preference.
  const applyTheme = (_newTheme: Theme) => {
    const root = document.documentElement;
    root.classList.remove('dark');
    setResolvedTheme('light');
  };

  // Set theme and persist to localStorage
  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch (error) {
      console.warn('Failed to save theme preference:', error);
    }
    applyTheme(newTheme);
  };

  // Toggle between light and dark (skipping system)
  const toggleTheme = () => {
    const newTheme = resolvedTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  };

  // Initialize theme on mount
  useEffect(() => {
    let savedTheme: Theme | null = null;
    try {
      savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    } catch (error) {
      console.warn('Failed to read theme preference:', error);
    }
    const initialTheme = savedTheme || 'light';
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is unavailable during SSR; theme is read post-mount to avoid a hydration mismatch
    setThemeState(initialTheme);
    applyTheme(initialTheme);
    setMounted(true);
  }, []);

  // Listen for system preference changes
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      applyTheme('system');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <ThemeContext.Provider
        value={{
          theme: 'system',
          resolvedTheme: 'light',
          setTheme: () => {},
          toggleTheme: () => {},
        }}
      >
        {children}
      </ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
