"""
Google File Search RAG Service for Calricula

Provides document-based Retrieval Augmented Generation (RAG) using Google's
Generative AI File API. This enables the AI assistant to reference uploaded
documents (PCAH, Title 5, course templates, etc.) when generating responses.

The File Search API allows:
- Uploading documents for indexing
- Querying documents with semantic search
- Generating responses grounded in document content
- Extracting citations from responses
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

import google.generativeai as genai
# from google.generativeai import caching

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

    Uses the google-generativeai library's File API for document management
    and caching for efficient repeated queries.
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

    def __init__(self, model_name: str = "gemini-2.5-flash"):
        """
        Initialize the File Search Service.

        Args:
            model_name: The Gemini model to use for generation
        """
        self.model_name = model_name
        self.model = None
        self._configured = False
        self._uploaded_files: Dict[str, DocumentMetadata] = {}
        self._cache: Any = None

    def _ensure_configured(self) -> None:
        """Ensure the Gemini API is configured."""
        if not self._configured:
            api_key = self._get_api_key()
            genai.configure(api_key=api_key)
            self._configured = True

        if self.model is None:
            self.model = genai.GenerativeModel(
                model_name=self.model_name,
                generation_config=genai.GenerationConfig(
                    temperature=0.4,  # Lower temp for factual responses
                    max_output_tokens=4096,
                )
            )

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

        # Check if already uploaded (by hash)
        for doc in self._uploaded_files.values():
            if file_hash in doc.file_id:
                logger.info(f"Document already uploaded: {doc.display_name}")
                return doc

        # Upload to Google File API
        try:
            logger.info(f"Uploading document: {path.name}")

            # Use genai.upload_file for the File API
            uploaded_file = genai.upload_file(
                path=str(path),
                display_name=display_name or path.stem,
                mime_type=mime_type,
            )

            # Wait for file to be processed
            while uploaded_file.state.name == "PROCESSING":
                await asyncio.sleep(1)
                uploaded_file = genai.get_file(uploaded_file.name)

            if uploaded_file.state.name == "FAILED":
                raise ValueError(f"File processing failed: {uploaded_file.name}")

            # Create metadata
            metadata = DocumentMetadata(
                file_id=uploaded_file.name,
                filename=path.name,
                display_name=display_name or path.stem,
                mime_type=mime_type,
                size_bytes=path.stat().st_size,
                upload_time=datetime.utcnow(),
                document_type=document_type,
                tags=tags or [],
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
        Delete an uploaded document.

        Args:
            file_id: The file ID from DocumentMetadata

        Returns:
            True if deleted successfully
        """
        self._ensure_configured()

        try:
            genai.delete_file(file_id)
            if file_id in self._uploaded_files:
                del self._uploaded_files[file_id]
            logger.info(f"Document deleted: {file_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete document: {str(e)}")
            return False

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
        """
        self._ensure_configured()

        # Determine which files to use
        files_to_use = []

        if file_ids:
            # Use specified files
            for fid in file_ids:
                try:
                    file_obj = genai.get_file(fid)
                    files_to_use.append(file_obj)
                except Exception as e:
                    logger.warning(f"Could not get file {fid}: {str(e)}")
        else:
            # Use all files matching document_types filter
            for doc in self._uploaded_files.values():
                if document_types is None or doc.document_type in document_types:
                    try:
                        file_obj = genai.get_file(doc.file_id)
                        files_to_use.append(file_obj)
                    except Exception as e:
                        logger.warning(f"Could not get file {doc.file_id}: {str(e)}")

        if not files_to_use:
            # Fall back to regular generation without RAG
            return await self._generate_without_rag(query, system_prompt)

        # Build the prompt with system instructions
        full_prompt = ""
        if system_prompt:
            full_prompt = f"{system_prompt}\n\n---\n\n"

        if include_citations:
            full_prompt += """When answering, cite specific sections from the provided documents.
Format citations as [Source: document_name, Section: section_name].

---

"""

        full_prompt += f"Question: {query}"

        try:
            # Generate with file context
            response = self.model.generate_content([*files_to_use, full_prompt])

            # Extract citations from response
            citations = []
            if include_citations:
                citations = self._extract_citations(response.text, files_to_use)

            return RAGResponse(
                text=response.text,
                citations=citations,
                success=True,
                grounding_metadata=self._extract_grounding_metadata(response),
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
            response = self.model.generate_content(full_prompt)
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

    def _extract_citations(
        self,
        response_text: str,
        files: List[Any],
    ) -> List[Citation]:
        """
        Extract citations from response text.

        Looks for citation patterns like [Source: filename, Section: section]
        """
        import re

        citations = []

        # Pattern: [Source: filename, Section: section_name]
        pattern = r'\[Source:\s*([^,\]]+)(?:,\s*Section:\s*([^\]]+))?\]'

        for match in re.finditer(pattern, response_text):
            source_file = match.group(1).strip()
            section = match.group(2).strip() if match.group(2) else None

            citations.append(Citation(
                text=match.group(0),
                source_file=source_file,
                section=section,
            ))

        return citations

    def _extract_grounding_metadata(self, response: Any) -> Optional[Dict[str, Any]]:
        """Extract grounding metadata from Gemini response if available."""
        try:
            if hasattr(response, 'candidates') and response.candidates:
                candidate = response.candidates[0]
                if hasattr(candidate, 'grounding_metadata'):
                    return {
                        "grounding_attributions": getattr(
                            candidate.grounding_metadata,
                            'grounding_attributions',
                            []
                        ),
                        "web_search_queries": getattr(
                            candidate.grounding_metadata,
                            'web_search_queries',
                            []
                        ),
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
