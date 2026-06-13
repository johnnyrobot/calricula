"""
Document Upload API Routes for Calricula

Provides endpoints for uploading, managing, and indexing documents
for RAG (Retrieval-Augmented Generation) with the AI Assistant.
"""

import os
import uuid
import shutil
from datetime import datetime
from typing import Optional, List
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.database import get_session
from app.core.deps import get_current_user
from app.models.user import User
from app.models.document import (
    RAGDocument,
    RAGDocumentCreate,
    RAGDocumentRead,
    RAGDocumentUpdate,
    RAGDocumentType,
    IndexingStatus
)

router = APIRouter(prefix="/api/documents", tags=["Documents"])

# Configure upload directory
UPLOAD_DIR = Path("/tmp/calricula-uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Maximum file size (10MB)
MAX_FILE_SIZE = 10 * 1024 * 1024

# Allowed file types
ALLOWED_MIME_TYPES = {
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "text/plain": ".txt",
    "text/markdown": ".md",
}


# =============================================================================
# Response Models
# =============================================================================

class DocumentUploadResponse(BaseModel):
    """Response after document upload."""
    id: uuid.UUID
    filename: str
    display_name: str
    document_type: RAGDocumentType
    file_size_bytes: int
    mime_type: Optional[str]
    indexing_status: IndexingStatus
    course_id: Optional[uuid.UUID]
    created_at: datetime
    message: str


class DocumentListResponse(BaseModel):
    """Response for listing documents."""
    documents: List[RAGDocumentRead]
    total: int
    page: int
    page_size: int


class DocumentStatusResponse(BaseModel):
    """Response for document indexing status."""
    id: uuid.UUID
    filename: str
    indexing_status: IndexingStatus
    indexed_at: Optional[datetime]


# =============================================================================
# Document Upload Endpoints
# =============================================================================

@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(..., description="Document file to upload"),
    document_type: RAGDocumentType = Form(default=RAGDocumentType.OTHER, description="Type of document"),
    display_name: Optional[str] = Form(default=None, description="Display name for the document"),
    course_id: Optional[uuid.UUID] = Form(default=None, description="Associated course ID"),
    department_id: Optional[uuid.UUID] = Form(default=None, description="Associated department ID"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a document for RAG indexing.

    Supported file types:
    - PDF (.pdf)
    - Word Documents (.doc, .docx)
    - Plain Text (.txt)
    - Markdown (.md)

    Maximum file size: 10MB

    The document will be queued for indexing with Google File Search API
    for use with the AI Assistant.
    """
    # Validate file type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{file.content_type}' not allowed. Allowed types: {list(ALLOWED_MIME_TYPES.keys())}"
        )

    # Read file content to check size
    content = await file.read()
    file_size = len(content)

    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File size ({file_size} bytes) exceeds maximum allowed ({MAX_FILE_SIZE} bytes)"
        )

    if file_size == 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot upload empty file"
        )

    # Generate unique filename
    file_extension = ALLOWED_MIME_TYPES.get(file.content_type, ".bin")
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = UPLOAD_DIR / unique_filename

    # Save file to disk
    try:
        with open(file_path, "wb") as f:
            f.write(content)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save file: {str(e)}"
        )

    # Create database record
    document = RAGDocument(
        filename=file.filename or unique_filename,
        display_name=display_name or file.filename or unique_filename,
        document_type=document_type,
        file_size_bytes=file_size,
        mime_type=file.content_type,
        indexing_status=IndexingStatus.PENDING,
        course_id=course_id,
        department_id=department_id,
        uploaded_by=current_user.id,
        custom_metadata={
            "original_filename": file.filename,
            "stored_path": str(file_path),
        }
    )

    session.add(document)
    session.commit()
    session.refresh(document)

    # TODO: Trigger async indexing with Google File Search API
    # For now, we'll mark it as pending and a background worker would process it

    return DocumentUploadResponse(
        id=document.id,
        filename=document.filename,
        display_name=document.display_name,
        document_type=document.document_type,
        file_size_bytes=document.file_size_bytes,
        mime_type=document.mime_type,
        indexing_status=document.indexing_status,
        course_id=document.course_id,
        created_at=document.created_at,
        message="Document uploaded successfully. Indexing queued."
    )


@router.get("/", response_model=DocumentListResponse)
async def list_documents(
    course_id: Optional[uuid.UUID] = Query(default=None, description="Filter by course ID"),
    department_id: Optional[uuid.UUID] = Query(default=None, description="Filter by department ID"),
    document_type: Optional[RAGDocumentType] = Query(default=None, description="Filter by document type"),
    indexing_status: Optional[IndexingStatus] = Query(default=None, description="Filter by indexing status"),
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    List documents with optional filtering.

    Returns paginated list of documents for the current user.
    """
    # Build query
    query = select(RAGDocument).where(RAGDocument.uploaded_by == current_user.id)

    if course_id:
        query = query.where(RAGDocument.course_id == course_id)
    if department_id:
        query = query.where(RAGDocument.department_id == department_id)
    if document_type:
        query = query.where(RAGDocument.document_type == document_type)
    if indexing_status:
        query = query.where(RAGDocument.indexing_status == indexing_status)

    # Get total count
    count_query = select(RAGDocument).where(RAGDocument.uploaded_by == current_user.id)
    if course_id:
        count_query = count_query.where(RAGDocument.course_id == course_id)
    if department_id:
        count_query = count_query.where(RAGDocument.department_id == department_id)
    if document_type:
        count_query = count_query.where(RAGDocument.document_type == document_type)
    if indexing_status:
        count_query = count_query.where(RAGDocument.indexing_status == indexing_status)

    total_results = session.exec(count_query).all()
    total = len(total_results)

    # Apply pagination
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size).order_by(RAGDocument.created_at.desc())

    documents = session.exec(query).all()

    return DocumentListResponse(
        documents=[RAGDocumentRead(
            id=doc.id,
            filename=doc.filename,
            display_name=doc.display_name,
            document_type=doc.document_type,
            file_size_bytes=doc.file_size_bytes,
            mime_type=doc.mime_type,
            indexing_status=doc.indexing_status,
            file_search_document_id=doc.file_search_document_id,
            file_search_store_name=doc.file_search_store_name,
            department_id=doc.department_id,
            course_id=doc.course_id,
            uploaded_by=doc.uploaded_by,
            custom_metadata=doc.custom_metadata,
            created_at=doc.created_at,
            indexed_at=doc.indexed_at
        ) for doc in documents],
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/course/{course_id}", response_model=DocumentListResponse)
async def get_course_documents(
    course_id: uuid.UUID,
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get all documents associated with a specific course.

    Returns paginated list of documents for a course (any user's uploads).
    """
    query = select(RAGDocument).where(RAGDocument.course_id == course_id)

    # Get total count
    total_results = session.exec(query).all()
    total = len(total_results)

    # Apply pagination
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size).order_by(RAGDocument.created_at.desc())

    documents = session.exec(query).all()

    return DocumentListResponse(
        documents=[RAGDocumentRead(
            id=doc.id,
            filename=doc.filename,
            display_name=doc.display_name,
            document_type=doc.document_type,
            file_size_bytes=doc.file_size_bytes,
            mime_type=doc.mime_type,
            indexing_status=doc.indexing_status,
            file_search_document_id=doc.file_search_document_id,
            file_search_store_name=doc.file_search_store_name,
            department_id=doc.department_id,
            course_id=doc.course_id,
            uploaded_by=doc.uploaded_by,
            custom_metadata=doc.custom_metadata,
            created_at=doc.created_at,
            indexed_at=doc.indexed_at
        ) for doc in documents],
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/{document_id}", response_model=RAGDocumentRead)
async def get_document(
    document_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get a specific document by ID.
    """
    document = session.get(RAGDocument, document_id)

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    return RAGDocumentRead(
        id=document.id,
        filename=document.filename,
        display_name=document.display_name,
        document_type=document.document_type,
        file_size_bytes=document.file_size_bytes,
        mime_type=document.mime_type,
        indexing_status=document.indexing_status,
        file_search_document_id=document.file_search_document_id,
        file_search_store_name=document.file_search_store_name,
        department_id=document.department_id,
        course_id=document.course_id,
        uploaded_by=document.uploaded_by,
        custom_metadata=document.custom_metadata,
        created_at=document.created_at,
        indexed_at=document.indexed_at
    )


@router.get("/{document_id}/status", response_model=DocumentStatusResponse)
async def get_document_status(
    document_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Get the indexing status of a document.

    Use this endpoint to poll for indexing completion after upload.
    """
    document = session.get(RAGDocument, document_id)

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    return DocumentStatusResponse(
        id=document.id,
        filename=document.filename,
        indexing_status=document.indexing_status,
        indexed_at=document.indexed_at
    )


@router.patch("/{document_id}", response_model=RAGDocumentRead)
async def update_document(
    document_id: uuid.UUID,
    update_data: RAGDocumentUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Update a document's metadata.

    Only the document owner can update it.
    """
    document = session.get(RAGDocument, document_id)

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Check ownership
    if document.uploaded_by != current_user.id and current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Not authorized to update this document")

    # Update fields
    if update_data.display_name is not None:
        document.display_name = update_data.display_name
    if update_data.document_type is not None:
        document.document_type = update_data.document_type
    if update_data.indexing_status is not None:
        document.indexing_status = update_data.indexing_status
    if update_data.file_search_document_id is not None:
        document.file_search_document_id = update_data.file_search_document_id
    if update_data.indexed_at is not None:
        document.indexed_at = update_data.indexed_at

    session.add(document)
    session.commit()
    session.refresh(document)

    return RAGDocumentRead(
        id=document.id,
        filename=document.filename,
        display_name=document.display_name,
        document_type=document.document_type,
        file_size_bytes=document.file_size_bytes,
        mime_type=document.mime_type,
        indexing_status=document.indexing_status,
        file_search_document_id=document.file_search_document_id,
        file_search_store_name=document.file_search_store_name,
        department_id=document.department_id,
        course_id=document.course_id,
        uploaded_by=document.uploaded_by,
        custom_metadata=document.custom_metadata,
        created_at=document.created_at,
        indexed_at=document.indexed_at
    )


@router.delete("/{document_id}")
async def delete_document(
    document_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a document.

    This removes both the database record and the stored file.
    Only the document owner or admin can delete it.
    """
    document = session.get(RAGDocument, document_id)

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Check ownership
    if document.uploaded_by != current_user.id and current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete this document")

    # Try to delete the file
    if document.custom_metadata and "stored_path" in document.custom_metadata:
        file_path = Path(document.custom_metadata["stored_path"])
        if file_path.exists():
            try:
                file_path.unlink()
            except Exception:
                pass  # File deletion is best-effort

    # Delete database record
    session.delete(document)
    session.commit()

    return {"message": "Document deleted successfully", "id": str(document_id)}


# =============================================================================
# Batch Operations
# =============================================================================

@router.post("/index/{document_id}")
async def trigger_indexing(
    document_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Manually trigger indexing for a document.

    Use this to re-index a document that failed or was updated.
    """
    document = session.get(RAGDocument, document_id)

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Check ownership
    if document.uploaded_by != current_user.id and current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Not authorized to index this document")

    # Update status to pending for re-indexing
    document.indexing_status = IndexingStatus.PENDING
    document.indexed_at = None

    session.add(document)
    session.commit()
    session.refresh(document)

    # TODO: Trigger async indexing with Google File Search API
    # This would typically send a message to a background worker

    return {
        "message": "Document queued for indexing",
        "id": str(document_id),
        "status": document.indexing_status
    }


@router.get("/types/list")
async def list_document_types():
    """
    List all available document types.

    Returns enum values for the document type selector.
    """
    return {
        "types": [
            {"value": t.value, "label": t.value.replace("_", " ").title()}
            for t in RAGDocumentType
        ]
    }
