'use client';

import React, { useState, useRef, useEffect } from 'react';
import { SunIcon, MoonIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import { AnimatedDropdown } from '@/components/animations';

interface ThemeToggleProps {
  /** Whether to show a dropdown menu (default) or just a simple toggle button */
  variant?: 'dropdown' | 'simple';
  /** Size of the toggle button */
  size?: 'sm' | 'md' | 'lg';
}

export function ThemeToggle({ variant = 'dropdown', size = 'md' }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Size classes
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-9 w-9',
    lg: 'h-10 w-10',
  };

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get current icon based on resolved theme
  const CurrentIcon = resolvedTheme === 'dark' ? MoonIcon : SunIcon;

  // Simple toggle button
  if (variant === 'simple') {
    return (
      <button
        onClick={toggleTheme}
        className={`${sizeClasses[size]} flex items-center justify-center rounded-lg
          text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800
          focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500
          focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900
          transition-colors`}
        aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
      >
        <CurrentIcon className={iconSizes[size]} />
      </button>
    );
  }

  // Dropdown variant
  const themeOptions = [
    { value: 'light' as const, label: 'Light', icon: SunIcon },
    { value: 'dark' as const, label: 'Dark', icon: MoonIcon },
    { value: 'system' as const, label: 'System', icon: ComputerDesktopIcon },
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`${sizeClasses[size]} flex items-center justify-center rounded-lg
          text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800
          focus:outline-none focus-visible:ring-2 focus-visible:ring-luminous-500
          focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900
          transition-colors`}
        aria-label="Toggle theme"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <CurrentIcon className={iconSizes[size]} />
      </button>

      <AnimatedDropdown
        isOpen={isOpen}
        position="bottom-right"
        className="absolute right-0 mt-2 w-36 rounded-lg bg-white dark:bg-slate-800
          shadow-lg ring-1 ring-black ring-opacity-5 dark:ring-slate-700
          py-1 z-50"
      >
        <div role="menu" aria-orientation="vertical">
          {themeOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = theme === option.value;

            return (
              <button
                key={option.value}
                onClick={() => {
                  setTheme(option.value);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center gap-3 px-3 py-2 text-sm
                  ${isSelected
                    ? 'text-luminous-600 dark:text-luminous-400 bg-luminous-50 dark:bg-luminous-950'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }
                  transition-colors`}
                role="menuitem"
                aria-current={isSelected ? 'true' : undefined}
              >
                <Icon className="h-4 w-4" />
                <span>{option.label}</span>
                {isSelected && (
                  <span className="ml-auto">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </AnimatedDropdown>
    </div>
  );
}

export default ThemeToggle;
