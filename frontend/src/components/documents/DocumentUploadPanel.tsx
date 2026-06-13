'use client';

/**
 * Document Upload Panel Component
 *
 * A collapsible side panel for uploading and managing documents
 * for RAG (Retrieval-Augmented Generation) with the AI Assistant.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  DocumentArrowUpIcon,
  DocumentTextIcon,
  XMarkIcon,
  TrashIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { DocumentArrowUpIcon as DocumentArrowUpIconSolid } from '@heroicons/react/24/solid';
import { useAuth } from '@/contexts/AuthContext';
import api, {
  RAGDocument,
  RAGDocumentType,
  IndexingStatus,
  DocumentUploadResponse,
} from '@/lib/api';

// =============================================================================
// Types
// =============================================================================

interface DocumentUploadPanelProps {
  courseId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface UploadProgress {
  file: File;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  error?: string;
  document?: DocumentUploadResponse;
}

// =============================================================================
// Constants
// =============================================================================

const DOCUMENT_TYPE_OPTIONS: Array<{ value: RAGDocumentType; label: string; description: string }> = [
  { value: 'syllabus', label: 'Syllabus', description: 'Course syllabus or outline' },
  { value: 'textbook', label: 'Textbook', description: 'Textbook content or table of contents' },
  { value: 'standard', label: 'Standard', description: 'C-ID or curriculum standard' },
  { value: 'regulation', label: 'Regulation', description: 'Title 5 or PCAH regulation' },
  { value: 'advisory_notes', label: 'Advisory Notes', description: 'Advisory committee notes' },
  { value: 'other', label: 'Other', description: 'Other reference material' },
];

const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// =============================================================================
// Helper Functions
// =============================================================================

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getStatusIcon(status: IndexingStatus) {
  switch (status) {
    case 'completed':
      return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
    case 'indexing':
      return <ArrowPathIcon className="w-4 h-4 text-luminous-500 animate-spin" />;
    case 'failed':
      return <ExclamationCircleIcon className="w-4 h-4 text-red-500" />;
    case 'pending':
    default:
      return <ClockIcon className="w-4 h-4 text-amber-500" />;
  }
}

function getStatusLabel(status: IndexingStatus): string {
  switch (status) {
    case 'completed':
      return 'Ready';
    case 'indexing':
      return 'Indexing...';
    case 'failed':
      return 'Failed';
    case 'pending':
    default:
      return 'Queued';
  }
}

// =============================================================================
// Component
// =============================================================================

export default function DocumentUploadPanel({
  courseId,
  isOpen,
  onClose,
}: DocumentUploadPanelProps) {
  const { getToken } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [documents, setDocuments] = useState<RAGDocument[]>([]);
  const [uploading, setUploading] = useState<UploadProgress[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<RAGDocumentType>('other');
  const [isDragging, setIsDragging] = useState(false);

  // Load documents when panel opens
  useEffect(() => {
    if (isOpen && courseId) {
      loadDocuments();
    }
  }, [isOpen, courseId]);

  // Set up API token
  useEffect(() => {
    const setupToken = async () => {
      if (getToken) {
        const token = await getToken();
        if (token) {
          api.setToken(token);
        }
      }
    };
    setupToken();
  }, [getToken]);

  const loadDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getCourseDocuments(courseId);
      setDocuments(response.documents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const validFiles: File[] = [];
      const errors: string[] = [];

      // Validate files
      Array.from(files).forEach((file) => {
        if (!ALLOWED_FILE_TYPES.includes(file.type)) {
          errors.push(`${file.name}: Invalid file type. Please upload PDF, DOC, DOCX, TXT, or MD files.`);
        } else if (file.size > MAX_FILE_SIZE) {
          errors.push(`${file.name}: File too large. Maximum size is 10MB.`);
        } else if (file.size === 0) {
          errors.push(`${file.name}: File is empty.`);
        } else {
          validFiles.push(file);
        }
      });

      if (errors.length > 0) {
        setError(errors.join('\n'));
      }

      // Upload valid files
      for (const file of validFiles) {
        const uploadItem: UploadProgress = {
          file,
          progress: 0,
          status: 'uploading',
        };
        setUploading((prev) => [...prev, uploadItem]);

        try {
          const response = await api.uploadDocument(file, {
            document_type: selectedType,
            course_id: courseId,
          });

          setUploading((prev) =>
            prev.map((item) =>
              item.file === file
                ? { ...item, progress: 100, status: 'completed', document: response }
                : item
            )
          );

          // Add to documents list
          setDocuments((prev) => [
            {
              id: response.id,
              filename: response.filename,
              display_name: response.display_name,
              document_type: response.document_type,
              file_size_bytes: response.file_size_bytes,
              mime_type: response.mime_type,
              indexing_status: response.indexing_status,
              file_search_document_id: null,
              file_search_store_name: null,
              department_id: null,
              course_id: response.course_id,
              uploaded_by: '',
              custom_metadata: {},
              created_at: response.created_at,
              indexed_at: null,
            },
            ...prev,
          ]);

          // Clear upload item after delay
          setTimeout(() => {
            setUploading((prev) => prev.filter((item) => item.file !== file));
          }, 2000);
        } catch (err) {
          setUploading((prev) =>
            prev.map((item) =>
              item.file === file
                ? {
                    ...item,
                    status: 'error',
                    error: err instanceof Error ? err.message : 'Upload failed',
                  }
                : item
            )
          );
        }
      }
    },
    [courseId, selectedType]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFileSelect(e.dataTransfer.files);
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDelete = async (documentId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
      await api.deleteDocument(documentId);
      setDocuments((prev) => prev.filter((doc) => doc.id !== documentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document');
    }
  };

  const handleRetryIndexing = async (documentId: string) => {
    try {
      await api.triggerDocumentIndexing(documentId);
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === documentId ? { ...doc, indexing_status: 'pending' } : doc
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry indexing');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white dark:bg-gray-900 shadow-xl z-50 flex flex-col border-l border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
        <div className="flex items-center gap-2">
          <DocumentArrowUpIconSolid className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Course Materials
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Close panel"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Document Type Selector */}
        <div>
          <label className="luminous-label text-sm">Document Type</label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as RAGDocumentType)}
            className="luminous-input w-full mt-1"
          >
            {DOCUMENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            {DOCUMENT_TYPE_OPTIONS.find((o) => o.value === selectedType)?.description}
          </p>
        </div>

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`
            relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all
            ${isDragging
              ? 'border-luminous-500 bg-luminous-50 dark:bg-luminous-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-luminous-400 hover:bg-gray-50 dark:hover:bg-gray-800'
            }
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.txt,.md"
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
          />
          <DocumentArrowUpIcon className="w-10 h-10 mx-auto text-gray-400" />
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            <span className="font-medium text-luminous-600 dark:text-luminous-400">
              Click to upload
            </span>{' '}
            or drag and drop
          </p>
          <p className="mt-1 text-xs text-gray-500">
            PDF, DOC, DOCX, TXT, MD up to 10MB
          </p>
        </div>

        {/* Upload Progress */}
        {uploading.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Uploading
            </h3>
            {uploading.map((item, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <DocumentTextIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                    {item.file.name}
                  </p>
                  {item.status === 'uploading' && (
                    <div className="mt-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-luminous-500 transition-all duration-300"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}
                  {item.status === 'error' && (
                    <p className="text-xs text-red-500">{item.error}</p>
                  )}
                </div>
                {item.status === 'completed' && (
                  <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                )}
                {item.status === 'uploading' && (
                  <ArrowPathIcon className="w-5 h-5 text-luminous-500 animate-spin flex-shrink-0" />
                )}
                {item.status === 'error' && (
                  <ExclamationCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400 whitespace-pre-line">
              {error}
            </p>
            <button
              onClick={() => setError(null)}
              className="mt-2 text-xs text-red-500 hover:text-red-700 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Documents List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Uploaded Documents ({documents.length})
            </h3>
            {documents.length > 0 && (
              <button
                onClick={loadDocuments}
                className="p-1 text-gray-500 hover:text-gray-700"
                title="Refresh"
              >
                <ArrowPathIcon className="w-4 h-4" />
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <ArrowPathIcon className="w-6 h-6 text-luminous-500 animate-spin" />
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8">
              <DocumentTextIcon className="w-12 h-12 mx-auto text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">
                No documents uploaded yet
              </p>
              <p className="text-xs text-gray-400">
                Upload documents to enhance AI suggestions
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg group"
                >
                  <DocumentTextIcon className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {doc.display_name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500">
                        {formatFileSize(doc.file_size_bytes)}
                      </span>
                      <span className="text-xs text-gray-300">|</span>
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                        {getStatusIcon(doc.indexing_status)}
                        {getStatusLabel(doc.indexing_status)}
                      </span>
                    </div>
                    <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded">
                      {doc.document_type.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {doc.indexing_status === 'failed' && (
                      <button
                        onClick={() => handleRetryIndexing(doc.id)}
                        className="p-1 text-amber-500 hover:text-amber-700"
                        title="Retry indexing"
                      >
                        <ArrowPathIcon className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="p-1 text-red-500 hover:text-red-700"
                      title="Delete document"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <p className="text-xs text-gray-500 text-center">
          Documents are indexed for AI-powered suggestions and compliance checking.
        </p>
      </div>
    </div>
  );
}
