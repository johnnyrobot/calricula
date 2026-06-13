"""
Document models for file uploads and RAG integration.
"""

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any, List, TYPE_CHECKING

from sqlmodel import Field, SQLModel, Relationship, Column
from sqlalchemy import JSON

if TYPE_CHECKING:
    from app.models.department import Department
    from app.models.course import Course
    from app.models.user import User


class DocumentType(str, Enum):
    """Types of uploaded documents."""
    CONTENT_REVIEW = "ContentReview"
    SUPPORTING_DOC = "SupportingDoc"
    EXPORT = "Export"


class RAGDocumentType(str, Enum):
    """Types of documents for RAG/AI context."""
    SYLLABUS = "syllabus"
    TEXTBOOK = "textbook"
    STANDARD = "standard"
    REGULATION = "regulation"
    ADVISORY_NOTES = "advisory_notes"
    OTHER = "other"


class IndexingStatus(str, Enum):
    """Status of document indexing for RAG."""
    PENDING = "pending"
    INDEXING = "indexing"
    COMPLETED = "completed"
    FAILED = "failed"


class EntityType(str, Enum):
    """Entity types for document associations."""
    COURSE = "Course"
    PROGRAM = "Program"


class DocumentBase(SQLModel):
    """Base document fields."""
    entity_type: EntityType
    entity_id: uuid.UUID
    filename: str
    file_path: str
    document_type: DocumentType


class Document(DocumentBase, table=True):
    """
    Document model for general file uploads.

    Used for content review documents, supporting docs, and exports.
    """
    __tablename__ = "documents"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class DocumentCreate(DocumentBase):
    """Schema for creating a document."""
    pass


class DocumentRead(DocumentBase):
    """Schema for reading document data."""
    id: uuid.UUID
    created_at: datetime


# =============================================================================
# RAG Documents (for AI File Search)
# =============================================================================

class RAGDocumentBase(SQLModel):
    """Base RAG document fields."""
    filename: str
    display_name: str
    document_type: RAGDocumentType = Field(default=RAGDocumentType.OTHER)
    file_size_bytes: int = Field(default=0)
    mime_type: Optional[str] = None
    indexing_status: IndexingStatus = Field(default=IndexingStatus.PENDING)


class RAGDocument(RAGDocumentBase, table=True):
    """
    RAG document model for AI-enabled document search.

    Tracks documents uploaded to Google File Search for RAG context.
    """
    __tablename__ = "rag_documents"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    file_search_document_id: Optional[str] = None  # Google File Search ID
    file_search_store_name: Optional[str] = None
    department_id: Optional[uuid.UUID] = Field(default=None, foreign_key="departments.id")
    course_id: Optional[uuid.UUID] = Field(default=None, foreign_key="courses.id")
    uploaded_by: uuid.UUID = Field(foreign_key="users.id")
    custom_metadata: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    indexed_at: Optional[datetime] = None

    # Relationships
    department: Optional["Department"] = Relationship()
    course: Optional["Course"] = Relationship()
    uploader: Optional["User"] = Relationship()


class RAGDocumentCreate(RAGDocumentBase):
    """Schema for creating a RAG document."""
    department_id: Optional[uuid.UUID] = None
    course_id: Optional[uuid.UUID] = None
    uploaded_by: uuid.UUID
    custom_metadata: Dict[str, Any] = {}


class RAGDocumentRead(RAGDocumentBase):
    """Schema for reading RAG document data."""
    id: uuid.UUID
    file_search_document_id: Optional[str]
    file_search_store_name: Optional[str]
    department_id: Optional[uuid.UUID]
    course_id: Optional[uuid.UUID]
    uploaded_by: uuid.UUID
    custom_metadata: Dict[str, Any]
    created_at: datetime
    indexed_at: Optional[datetime]


class RAGDocumentUpdate(SQLModel):
    """Schema for updating RAG document."""
    display_name: Optional[str] = None
    document_type: Optional[RAGDocumentType] = None
    indexing_status: Optional[IndexingStatus] = None
    file_search_document_id: Optional[str] = None
    indexed_at: Optional[datetime] = None


# =============================================================================
# AI Chat History
# =============================================================================

class AIChatHistoryBase(SQLModel):
    """Base AI chat history fields."""
    course_id: Optional[uuid.UUID] = Field(default=None, foreign_key="courses.id")


class AIChatHistory(AIChatHistoryBase, table=True):
    """
    AI chat history model for storing conversations.

    Tracks user interactions with the AI curriculum assistant.
    """
    __tablename__ = "ai_chat_history"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id")
    messages: List[Dict[str, Any]] = Field(default=[], sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    user: Optional["User"] = Relationship()
    course: Optional["Course"] = Relationship()


class AIChatHistoryCreate(AIChatHistoryBase):
    """Schema for creating AI chat history."""
    user_id: uuid.UUID
    messages: List[Dict[str, Any]] = []


class AIChatHistoryRead(AIChatHistoryBase):
    """Schema for reading AI chat history."""
    id: uuid.UUID
    user_id: uuid.UUID
    messages: List[Dict[str, Any]]
    created_at: datetime
    updated_at: datetime


class AIChatHistoryUpdate(SQLModel):
    """Schema for updating AI chat history."""
    messages: Optional[List[Dict[str, Any]]] = None
