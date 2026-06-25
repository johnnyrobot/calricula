"""
Google File Search RAG Service for Calricula

Provides document-based Retrieval Augmented Generation (RAG) using Google's
managed File Search Stores (google-genai). Documents are indexed once into a
persistent store (no 48h Files-API expiry) and the FileSearch tool retrieves
them at query time, returning native page-level grounding citations.

This enables the AI assistant to reference uploaded documents (PCAH, Title 5,
course templates, etc.) when generating responses:
- Importing documents into a persistent File Search Store
- Querying the store with semantic search via the FileSearch tool
- Generating responses grounded in document content
- Extracting native citations from the response's grounding metadata
"""

import os
import logging
import asyncio
import json
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple
from dataclasses import dataclass, field
from datetime import datetime
import hashlib

from google import genai
from google.genai import types

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class DocumentMetadata:
    """Metadata for an uploaded document."""
    file_id: str
    filename: str
    display_name: str
    mime_type: str
    size_bytes: int
    upload_time: datetime
    document_type: str  # e.g., "regulation", "template", "course_outline"
    tags: List[str] = field(default_factory=list)
    file_hash: Optional[str] = None  # Content hash for upload deduplication


@dataclass
class Citation:
    """A citation from a RAG response."""
    text: str
    source_file: str
    page_number: Optional[int] = None
    section: Optional[str] = None


@dataclass
class RAGResponse:
    """Response from a RAG query."""
    text: str
    citations: List[Citation]
    success: bool
    error: Optional[str] = None
    grounding_metadata: Optional[Dict[str, Any]] = None


class FileSearchService:
    """
    Service for Google File Search API with RAG capabilities.

    This service manages:
    - Document uploads and indexing
    - Semantic search across documents
    - Response generation grounded in documents
    - Citation extraction

    Uses the managed google-genai File Search Stores for persistent document
    indexing and native, page-level citations.
    """

    # Default chunk settings for document processing
    DEFAULT_CHUNK_SIZE = 2048
    DEFAULT_CHUNK_OVERLAP = 256

    # Supported MIME types for upload
    SUPPORTED_MIME_TYPES = {
        ".pdf": "application/pdf",
        ".txt": "text/plain",
        ".md": "text/markdown",
        ".html": "text/html",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".json": "application/json",
    }

    def __init__(self, model_name: Optional[str] = None):
        """
        Initialize the File Search Service.

        Args:
            model_name: The Gemini model to use for generation. Defaults to
                settings.FILE_SEARCH_MODEL (externalized in WS-2a).
        """
        self.model_name = model_name or settings.FILE_SEARCH_MODEL
        self.client: Optional[genai.Client] = None
        self._generation_config: Optional[types.GenerateContentConfig] = None
        self._store_name: Optional[str] = None
        self._configured = False
        self._uploaded_files: Dict[str, DocumentMetadata] = {}
        self._cache: Any = None

    def _ensure_configured(self) -> None:
        """Ensure the unified google-genai client is initialized."""
        if not self._configured or self.client is None:
            api_key = self._get_api_key()
            self.client = genai.Client(api_key=api_key)
            self._generation_config = types.GenerateContentConfig(
                temperature=0.4,  # Lower temp for factual responses
                max_output_tokens=4096,
            )
            self._configured = True

    def _ensure_store(self) -> str:
        """Get or create the persistent managed File Search Store.

        Unlike the legacy Files API (uploads expire after 48h), a File Search
        Store persists, so documents are indexed once and reused across queries.
        Identified by settings.GEMINI_FILE_SEARCH_STORE_NAME.
        """
        self._ensure_configured()
        if self._store_name:
            return self._store_name

        display_name = settings.GEMINI_FILE_SEARCH_STORE_NAME
        try:
            for store in self.client.file_search_stores.list():
                if getattr(store, "display_name", None) == display_name:
                    self._store_name = store.name
                    logger.info(f"Using existing file search store: {self._store_name}")
                    return self._store_name
        except Exception as e:  # listing is best-effort; fall through to create
            logger.warning(f"Could not list file search stores: {e}")

        store = self.client.file_search_stores.create(
            config=types.CreateFileSearchStoreConfig(display_name=display_name)
        )
        self._store_name = store.name
        logger.info(f"Created file search store: {self._store_name}")
        return self._store_name

    def _get_api_key(self) -> str:
        """Get Google API key from environment or file."""
        api_key = os.getenv("GOOGLE_API_KEY")
        if api_key and not api_key.startswith("AIzaSy..."):
            return api_key

        api_key_path = "/tmp/google-api-key"
        if os.path.exists(api_key_path):
            with open(api_key_path, "r") as f:
                return f.read().strip()

        raise ValueError("Google API key not found. Set GOOGLE_API_KEY environment variable.")

    def _compute_file_hash(self, file_path: str) -> str:
        """Compute SHA256 hash of a file for deduplication."""
        hasher = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                hasher.update(chunk)
        return hasher.hexdigest()[:16]

    async def upload_document(
        self,
        file_path: str,
        display_name: Optional[str] = None,
        document_type: str = "reference",
        tags: Optional[List[str]] = None,
    ) -> DocumentMetadata:
        """
        Upload a document for RAG indexing.

        Args:
            file_path: Path to the document file
            display_name: Human-readable name for the document
            document_type: Category of document (regulation, template, course_outline)
            tags: Optional tags for filtering

        Returns:
            DocumentMetadata with file information

        Raises:
            FileNotFoundError: If file doesn't exist
            ValueError: If file type is not supported
        """
        self._ensure_configured()

        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        suffix = path.suffix.lower()
        if suffix not in self.SUPPORTED_MIME_TYPES:
            raise ValueError(
                f"Unsupported file type: {suffix}. "
                f"Supported types: {list(self.SUPPORTED_MIME_TYPES.keys())}"
            )

        mime_type = self.SUPPORTED_MIME_TYPES[suffix]
        file_hash = self._compute_file_hash(file_path)

        # Check if already uploaded (by content hash)
        for doc in self._uploaded_files.values():
            if doc.file_hash and doc.file_hash == file_hash:
                logger.info(f"Document already uploaded: {doc.display_name}")
                return doc

        # Import the document into the persistent File Search Store
        try:
            logger.info(f"Importing document into file search store: {path.name}")
            store_name = self._ensure_store()

            operation = self.client.file_search_stores.upload_to_file_search_store(
                file_search_store_name=store_name,
                file=str(path),
                config=types.UploadToFileSearchStoreConfig(
                    display_name=display_name or path.stem,
                    mime_type=mime_type,
                ),
            )

            # Importing + indexing is a long-running operation; poll it (bounded).
            deadline = asyncio.get_running_loop().time() + 300
            while not operation.done:
                if asyncio.get_running_loop().time() > deadline:
                    raise TimeoutError(
                        f"Timed out importing document into store: {path.name}"
                    )
                await asyncio.sleep(2)
                operation = self.client.operations.get(operation)

            if getattr(operation, "error", None):
                raise ValueError(f"Document import failed: {operation.error}")

            # Resource name of the imported document (best-effort across SDK shapes).
            doc_name = (
                getattr(getattr(operation, "response", None), "name", None)
                or f"{store_name}/documents/{file_hash}"
            )

            # Create metadata
            metadata = DocumentMetadata(
                file_id=doc_name,
                filename=path.name,
                display_name=display_name or path.stem,
                mime_type=mime_type,
                size_bytes=path.stat().st_size,
                upload_time=datetime.utcnow(),
                document_type=document_type,
                tags=tags or [],
                file_hash=file_hash,
            )

            self._uploaded_files[uploaded_file.name] = metadata
            logger.info(f"Document uploaded successfully: {metadata.display_name} ({metadata.file_id})")

            return metadata

        except Exception as e:
            logger.error(f"Failed to upload document: {str(e)}")
            raise

    async def upload_documents_from_directory(
        self,
        directory: str,
        document_type: str = "reference",
        recursive: bool = False,
    ) -> List[DocumentMetadata]:
        """
        Upload all supported documents from a directory.

        Args:
            directory: Path to the directory
            document_type: Category for all documents
            recursive: Whether to search subdirectories

        Returns:
            List of DocumentMetadata for uploaded files
        """
        dir_path = Path(directory)
        if not dir_path.is_dir():
            raise ValueError(f"Not a directory: {directory}")

        pattern = "**/*" if recursive else "*"
        uploaded = []

        for file_path in dir_path.glob(pattern):
            if file_path.suffix.lower() in self.SUPPORTED_MIME_TYPES:
                try:
                    metadata = await self.upload_document(
                        str(file_path),
                        document_type=document_type,
                    )
                    uploaded.append(metadata)
                except Exception as e:
                    logger.warning(f"Failed to upload {file_path}: {str(e)}")

        return uploaded

    def list_uploaded_documents(
        self,
        document_type: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> List[DocumentMetadata]:
        """
        List uploaded documents with optional filtering.

        Args:
            document_type: Filter by document type
            tags: Filter by tags (documents must have ALL specified tags)

        Returns:
            List of matching DocumentMetadata
        """
        results = list(self._uploaded_files.values())

        if document_type:
            results = [d for d in results if d.document_type == document_type]

        if tags:
            results = [d for d in results if all(t in d.tags for t in tags)]

        return results

    async def delete_document(self, file_id: str) -> bool:
        """
        Delete a document from the File Search Store (best-effort).

        Args:
            file_id: The store document resource name from DocumentMetadata.

        Returns:
            True if the store document was deleted. Local tracking is always
            cleared. NOTE: the per-document delete surface is confirmed by the
            smoke test (scripts/smoke_test_file_search.py).
        """
        self._ensure_configured()

        deleted = False
        try:
            self.client.file_search_stores.documents.delete(name=file_id)
            deleted = True
            logger.info(f"Store document deleted: {file_id}")
        except Exception as e:
            logger.warning(f"Could not delete store document {file_id}: {str(e)}")

        if file_id in self._uploaded_files:
            del self._uploaded_files[file_id]
        return deleted

    async def generate_with_rag(
        self,
        query: str,
        file_ids: Optional[List[str]] = None,
        document_types: Optional[List[str]] = None,
        system_prompt: Optional[str] = None,
        include_citations: bool = True,
    ) -> RAGResponse:
        """
        Generate a response grounded in uploaded documents.

        Args:
            query: The user's question or request
            file_ids: Specific file IDs to search (None = all uploaded files)
            document_types: Filter files by document type
            system_prompt: Optional system instructions
            include_citations: Whether to extract and return citations

        Returns:
            RAGResponse with text, citations, and metadata

        Note:
            The managed File Search Store is searched natively by the FileSearch
            tool (semantic retrieval). ``file_ids`` and ``document_types`` are now
            advisory and no longer pre-filter the corpus; the whole store is
            searched. Citations come from the model's native (page-level)
            grounding metadata, not regex scraping of the answer text.
        """
        store_name = self._ensure_store()

        # Build the prompt. We no longer ask the model to inline [Source: ...]
        # markers -- the FileSearch tool returns structured grounding instead.
        full_prompt = ""
        if system_prompt:
            full_prompt = f"{system_prompt}\n\n---\n\n"
        full_prompt += f"Question: {query}"

        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=full_prompt,
                config=types.GenerateContentConfig(
                    temperature=0.4,  # Lower temp for factual responses
                    max_output_tokens=4096,
                    tools=[
                        types.Tool(
                            file_search=types.FileSearch(
                                file_search_store_names=[store_name],
                            )
                        )
                    ],
                ),
            )

            grounding = self._extract_grounding_metadata(response)
            citations = (
                self._extract_citations_from_grounding(response)
                if include_citations else []
            )

            # Fail closed: in a regulatory context, an answer for which the model
            # retrieved no source documents must not be presented as authoritative.
            if include_citations and grounding is None:
                return RAGResponse(
                    text="",
                    citations=[],
                    success=False,
                    error="No source documents were retrieved from the knowledge base for this query.",
                )

            return RAGResponse(
                text=response.text,
                citations=citations,
                success=True,
                grounding_metadata=grounding,
            )

        except Exception as e:
            logger.error(f"RAG generation failed: {str(e)}")
            return RAGResponse(
                text="",
                citations=[],
                success=False,
                error=str(e),
            )

    async def _generate_without_rag(
        self,
        query: str,
        system_prompt: Optional[str] = None,
    ) -> RAGResponse:
        """Generate a response without RAG when no documents are available."""
        self._ensure_configured()

        full_prompt = ""
        if system_prompt:
            full_prompt = f"{system_prompt}\n\n---\n\n"
        full_prompt += query

        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=full_prompt,
                config=self._generation_config,
            )
            return RAGResponse(
                text=response.text,
                citations=[],
                success=True,
            )
        except Exception as e:
            logger.error(f"Generation failed: {str(e)}")
            return RAGResponse(
                text="",
                citations=[],
                success=False,
                error=str(e),
            )

    def _extract_citations_from_grounding(self, response: Any) -> List[Citation]:
        """
        Extract native citations from the model's grounding metadata.

        Replaces the legacy regex scraping of ``[Source: ...]`` markers with the
        File Search tool's structured, page-level grounding chunks.
        """
        citations: List[Citation] = []
        try:
            candidate = response.candidates[0]
            gm = getattr(candidate, "grounding_metadata", None)
            chunks = getattr(gm, "grounding_chunks", None) if gm else None
            for chunk in chunks or []:
                ctx = getattr(chunk, "retrieved_context", None)
                if not ctx:
                    continue
                citations.append(Citation(
                    text=getattr(ctx, "text", None) or "",
                    source_file=(
                        getattr(ctx, "title", None)
                        or getattr(ctx, "uri", None)
                        or "knowledge base"
                    ),
                    page_number=getattr(ctx, "page_number", None),
                    section=getattr(ctx, "section", None),
                ))
        except Exception:
            pass
        return citations

    def _extract_grounding_metadata(self, response: Any) -> Optional[Dict[str, Any]]:
        """Extract grounding metadata from the response, or None if absent.

        Returns None when the model performed no grounding (i.e. the File Search
        tool retrieved nothing). Callers rely on this to fail closed rather than
        present an ungrounded answer as authoritative.
        """
        try:
            candidates = getattr(response, "candidates", None)
            if not candidates:
                return None
            gm = getattr(candidates[0], "grounding_metadata", None)
            if gm is None:
                return None
            chunks = getattr(gm, "grounding_chunks", None) or []
            supports = getattr(gm, "grounding_supports", None) or []
            if not chunks and not supports:
                return None
            return {
                "grounding_chunks_count": len(chunks),
                "grounding_supports_count": len(supports),
                "web_search_queries": getattr(gm, "web_search_queries", None) or [],
            }
        except Exception:
            pass
        return None

    async def search_documents(
        self,
        query: str,
        file_ids: Optional[List[str]] = None,
        max_results: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Search across documents for relevant passages.

        Args:
            query: Search query
            file_ids: Optional list of file IDs to search
            max_results: Maximum number of results to return

        Returns:
            List of matching passages with source information
        """
        self._ensure_configured()

        search_prompt = f"""Search the provided documents for information about: {query}

Return the {max_results} most relevant passages. For each passage, provide:
1. The exact text from the document
2. The source document name
3. The section or page where it appears (if identifiable)

Format as JSON array:
[
  {{
    "text": "exact passage text",
    "source": "document name",
    "section": "section name or page",
    "relevance": "brief explanation of relevance"
  }}
]"""

        response = await self.generate_with_rag(
            query=search_prompt,
            file_ids=file_ids,
            include_citations=False,
        )

        if not response.success:
            return []

        # Try to parse JSON from response
        try:
            import re
            json_match = re.search(r'\[[\s\S]*\]', response.text)
            if json_match:
                return json.loads(json_match.group())
        except (json.JSONDecodeError, ValueError):
            pass

        return []


# =============================================================================
# Specialized RAG Prompts for Calricula
# =============================================================================

CURRICULUM_RAG_SYSTEM_PROMPT = """You are an expert AI Curriculum Design Assistant for community colleges.

You have access to official curriculum documents including:
- PCAH (Program and Course Approval Handbook) 8th Edition
- Title 5 regulations for community colleges
- Course outline templates and examples
- CB Code reference materials

When answering questions:
1. Always cite the specific document and section you're referencing
2. Quote relevant passages directly when helpful
3. Explain how regulations apply to the specific question
4. If information is not found in the documents, say so clearly

Your goal is to help faculty create compliant, high-quality curriculum documents."""


class CalriculaRAGService(FileSearchService):
    """
    Specialized RAG service for curriculum development.

    Extends FileSearchService with curriculum-specific functionality:
    - Pre-configured system prompts for curriculum questions
    - Specialized methods for common curriculum queries
    - Integration with compliance checking
    """

    def __init__(self):
        super().__init__()
        self._pcah_file_id: Optional[str] = None
        self._title5_file_id: Optional[str] = None

    async def explain_regulation(
        self,
        regulation_reference: str,
        context: Optional[str] = None,
    ) -> RAGResponse:
        """
        Explain a specific regulation from PCAH or Title 5.

        Args:
            regulation_reference: e.g., "Title 5 § 55002.5" or "PCAH Chapter 4"
            context: Optional context about why this is being asked

        Returns:
            RAGResponse with explanation and citations
        """
        query = f"Explain {regulation_reference}"
        if context:
            query += f" in the context of: {context}"

        query += """

Please provide:
1. The full text or summary of the regulation
2. What it means in practical terms for curriculum development
3. Any related requirements or exceptions
4. Common compliance issues to avoid"""

        return await self.generate_with_rag(
            query=query,
            document_types=["regulation"],
            system_prompt=CURRICULUM_RAG_SYSTEM_PROMPT,
        )

    async def check_compliance_requirement(
        self,
        requirement_type: str,
        course_data: Dict[str, Any],
    ) -> RAGResponse:
        """
        Check a specific compliance requirement against course data.

        Args:
            requirement_type: e.g., "unit_calculation", "cb_codes", "prerequisites"
            course_data: Course information to check

        Returns:
            RAGResponse with compliance analysis
        """
        query = f"""Check the following course data for {requirement_type} compliance:

Course Data:
{json.dumps(course_data, indent=2)}

Based on the regulations in PCAH and Title 5:
1. Is this compliant? Why or why not?
2. What specific regulation(s) apply?
3. If not compliant, what needs to be changed?
4. Are there any warnings or best practices to consider?"""

        return await self.generate_with_rag(
            query=query,
            document_types=["regulation"],
            system_prompt=CURRICULUM_RAG_SYSTEM_PROMPT,
        )

    async def get_cb_code_guidance(
        self,
        cb_code: str,
        course_context: Optional[Dict[str, Any]] = None,
    ) -> RAGResponse:
        """
        Get guidance on a specific CB code.

        Args:
            cb_code: The CB code (e.g., "CB03", "CB09")
            course_context: Optional course data for context

        Returns:
            RAGResponse with CB code guidance
        """
        query = f"""Provide guidance on {cb_code}:

1. What does this CB code represent?
2. What are the valid values and their meanings?
3. What dependencies exist with other CB codes?
4. Common mistakes to avoid when setting this code?"""

        if course_context:
            query += f"""

Current course context:
{json.dumps(course_context, indent=2)}

Given this context, what value should {cb_code} be set to and why?"""

        return await self.generate_with_rag(
            query=query,
            document_types=["regulation", "reference"],
            system_prompt=CURRICULUM_RAG_SYSTEM_PROMPT,
        )


# =============================================================================
# Singleton Instance
# =============================================================================

_file_search_service: Optional[FileSearchService] = None
_calricula_rag_service: Optional[CalriculaRAGService] = None


def get_file_search_service() -> FileSearchService:
    """Get singleton FileSearchService instance."""
    global _file_search_service
    if _file_search_service is None:
        _file_search_service = FileSearchService()
    return _file_search_service


def get_calricula_rag_service() -> CalriculaRAGService:
    """Get singleton CalriculaRAGService instance."""
    global _calricula_rag_service
    if _calricula_rag_service is None:
        _calricula_rag_service = CalriculaRAGService()
    return _calricula_rag_service
