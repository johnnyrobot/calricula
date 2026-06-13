'use client';

/**
 * AI Assistant Panel Component
 *
 * Provides AI-powered curriculum development assistance in the course editor.
 * Features chat interface, quick actions, and context-aware suggestions.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  SparklesIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  AcademicCapIcon,
  LightBulbIcon,
} from '@heroicons/react/24/outline';
import { api, CourseDetail, AIMessage, AICourseContext, AIResponse } from '@/lib/api';

// =============================================================================
// Types
// =============================================================================

interface AIAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  course: CourseDetail | null;
  currentSection: string;
  onApplySuggestion?: (type: string, content: string) => void;
}

interface ChatMessage extends AIMessage {
  id: string;
  isLoading?: boolean;
}

// =============================================================================
// Quick Action Buttons
// =============================================================================

interface QuickAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  prompt: string;
  section?: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'catalog-description',
    label: 'Suggest Description',
    icon: DocumentTextIcon,
    prompt: 'Please suggest a catalog description for this course following community college style guidelines.',
    section: 'basic',
  },
  {
    id: 'suggest-slos',
    label: 'Suggest SLOs',
    icon: AcademicCapIcon,
    prompt: 'Please suggest 3 Student Learning Outcomes for this course using Bloom\'s Taxonomy action verbs.',
    section: 'slos',
  },
  {
    id: 'check-compliance',
    label: 'Check Compliance',
    icon: LightBulbIcon,
    prompt: 'Please review this course for community college compliance requirements and highlight any potential issues.',
  },
];

// =============================================================================
// AI Assistant Panel Component
// =============================================================================

export function AIAssistantPanel({
  isOpen,
  onClose,
  course,
  currentSection,
  onApplySuggestion,
}: AIAssistantPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom when messages change
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Build course context for API
  const buildCourseContext = useCallback((): AICourseContext | undefined => {
    if (!course) return undefined;
    return {
      course_code: `${course.subject_code} ${course.course_number}`,
      course_title: course.title,
      department: course.department?.name || course.subject_code,
      units: course.units,
      current_section: currentSection,
      existing_slos: course.slos?.map(s => s.outcome_text) || [],
      catalog_description: course.catalog_description || undefined,
    };
  }, [course, currentSection]);

  // Send message to AI
  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message.trim(),
      timestamp: new Date().toISOString(),
    };

    const loadingMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      isLoading: true,
    };

    setMessages(prev => [...prev, userMessage, loadingMessage]);
    setInputValue('');
    setIsLoading(true);
    setError(null);

    try {
      const context = buildCourseContext();
      const history = messages.filter(m => !m.isLoading);

      const response: AIResponse = await api.chatWithAI(
        message.trim(),
        history,
        context
      );

      setMessages(prev =>
        prev.map(m =>
          m.id === loadingMessage.id
            ? {
                ...m,
                content: response.text,
                isLoading: false,
                timestamp: new Date().toISOString(),
              }
            : m
        )
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get AI response';
      setError(errorMessage);
      setMessages(prev =>
        prev.map(m =>
          m.id === loadingMessage.id
            ? {
                ...m,
                content: `I apologize, but I encountered an error: ${errorMessage}. Please try again.`,
                isLoading: false,
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages, buildCourseContext]);

  // Handle form submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  // Handle quick action
  const handleQuickAction = (action: QuickAction) => {
    sendMessage(action.prompt);
  };

  // Clear chat history
  const handleClearChat = () => {
    setMessages([]);
    setError(null);
  };

  if (!isOpen) return null;

  // Filter quick actions based on current section
  const relevantActions = QUICK_ACTIONS.filter(
    action => !action.section || action.section === currentSection
  );

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-5 w-5 text-luminous-500" />
          <h3 className="font-semibold text-slate-900 dark:text-white">
            AI Assistant
          </h3>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
              title="Clear chat"
            >
              <ArrowPathIcon className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <>
            {/* Welcome Message */}
            <div className="p-3 bg-luminous-50 dark:bg-luminous-900/20 rounded-lg">
              <p className="text-sm text-luminous-700 dark:text-luminous-300">
                I&apos;m your AI Curriculum Assistant. I can help you with:
              </p>
              <ul className="mt-2 text-sm text-luminous-600 dark:text-luminous-400 space-y-1">
                <li>&bull; Writing catalog descriptions</li>
                <li>&bull; Creating effective SLOs (Bloom&apos;s Taxonomy)</li>
                <li>&bull; CB code selection guidance</li>
                <li>&bull; California CC compliance questions</li>
              </ul>
            </div>

            {/* Quick Actions */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Quick Actions
              </p>
              <div className="space-y-2">
                {relevantActions.map(action => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      onClick={() => handleQuickAction(action)}
                      disabled={isLoading}
                      className="w-full flex items-center gap-3 p-3 text-left rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 hover:border-luminous-300 dark:hover:border-luminous-700 transition-colors disabled:opacity-50"
                    >
                      <Icon className="h-5 w-5 text-luminous-500 flex-shrink-0" />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {action.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Chat Messages */}
            {messages.map(message => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-2 ${
                    message.role === 'user'
                      ? 'bg-luminous-600 text-white'
                      : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {message.isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin h-4 w-4 border-2 border-luminous-500 border-t-transparent rounded-full" />
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        Thinking...
                      </span>
                    </div>
                  ) : (
                    <div className="text-sm whitespace-pre-wrap">
                      {message.content}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="px-4 pb-2">
          <div className="p-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs rounded-lg">
            {error}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-700">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder="Ask a question..."
            className="flex-1 luminous-input text-sm"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="luminous-button-primary px-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <PaperAirplaneIcon className="h-4 w-4" />
            )}
          </button>
        </form>

        {/* Context Info */}
        {course && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Context: {course.subject_code} {course.course_number} - {course.title}
          </p>
        )}
      </div>
    </div>
  );
}

export default AIAssistantPanel;
