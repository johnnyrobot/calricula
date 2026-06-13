"""
AI API Routes for Calricula

Provides endpoints for AI-assisted curriculum development features.
Rate limited to prevent abuse.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from app.core.deps import get_current_user, get_current_user_optional
from app.core.rate_limiter import limiter, RATE_LIMITS
from app.models.user import User
from app.services.gemini_service import get_gemini_service

router = APIRouter(prefix="/api/ai", tags=["AI Assistant"])


# Request/Response Models
class ChatMessage(BaseModel):
    """A single chat message."""
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    """Request for AI chat."""
    message: str
    history: Optional[List[ChatMessage]] = None
    course_context: Optional[Dict[str, Any]] = None


class ChatResponse(BaseModel):
    """Response from AI chat."""
    text: str
    citations: List[Any] = []
    success: bool = True
    error: Optional[str] = None


class CatalogDescriptionRequest(BaseModel):
    """Request for catalog description suggestion."""
    course_title: str
    subject_code: str
    course_number: str
    units: float
    existing_description: Optional[str] = None
    slos: Optional[List[str]] = None


class SLORequest(BaseModel):
    """Request for SLO suggestions."""
    course_title: str
    subject_code: str
    catalog_description: Optional[str] = None
    existing_slos: Optional[List[str]] = None
    num_suggestions: int = 3


class ComplianceExplainRequest(BaseModel):
    """Request for compliance explanation."""
    issue_type: str
    context: Dict[str, Any]


class ContentOutlineRequest(BaseModel):
    """Request for content outline suggestions."""
    course_title: str
    subject_code: str
    contact_hours: float
    catalog_description: Optional[str] = None
    slos: Optional[List[str]] = None
    textbook_info: Optional[str] = None
    num_topics: int = 12


class ContentOutlineTopic(BaseModel):
    """A single topic in the content outline."""
    sequence: int
    title: str
    description: str
    hours: float
    slo_alignment: List[int] = []
    subtopics: List[str] = []


class ContentOutlineResponse(BaseModel):
    """Response from content outline generation."""
    topics: List[ContentOutlineTopic] = []
    total_hours: float = 0.0
    raw_text: Optional[str] = None
    success: bool = True
    error: Optional[str] = None


class TOPCodeRequest(BaseModel):
    """Request for TOP code suggestions."""
    course_title: str
    course_description: Optional[str] = None


class ProgramCourseInfo(BaseModel):
    """Course information for program narrative generation."""
    subject_code: str
    course_number: str
    title: str
    units: float


class ProgramNarrativeRequest(BaseModel):
    """Request for program narrative generation."""
    program_title: str
    program_type: str  # AA, AS, AA-T, AS-T, Certificate, ADT
    total_units: float
    catalog_description: Optional[str] = None
    courses: Optional[List[ProgramCourseInfo]] = None
    department: Optional[str] = None
    top_code: Optional[str] = None
    is_cte: bool = False


class ProgramNarrativeResponse(BaseModel):
    """Response from program narrative generation."""
    narrative: str
    goals_and_objectives: Optional[str] = None
    requirements_justification: Optional[str] = None
    catalog_description: Optional[str] = None
    labor_market_analysis: Optional[str] = None
    success: bool = True
    error: Optional[str] = None


class TOPCodeSuggestion(BaseModel):
    """A single TOP code suggestion."""
    code: str
    title: str
    is_vocational: bool
    confidence: float
    explanation: str


class TOPCodeResponse(BaseModel):
    """Response from TOP code suggestion."""
    suggestions: List[TOPCodeSuggestion] = []
    raw_text: Optional[str] = None
    success: bool = True
    error: Optional[str] = None


# ============= LMI AI Models =============

class OccupationSuggestion(BaseModel):
    """A suggested occupation from LMI data."""
    soc_code: str
    title: str
    confidence: float  # 0.0 to 1.0
    rationale: str


class LMIOccupationSuggestRequest(BaseModel):
    """Request for AI occupation suggestions from course content."""
    course_title: str
    course_description: Optional[str] = None
    objectives: Optional[List[str]] = None
    slos: Optional[List[str]] = None
    top_code: Optional[str] = None
    department: Optional[str] = None


class LMIOccupationSuggestResponse(BaseModel):
    """Response from LMI occupation suggestion."""
    suggestions: List[OccupationSuggestion] = []
    success: bool = True
    error: Optional[str] = None


class LMINarrativeRequest(BaseModel):
    """Request for LMI narrative generation."""
    course_title: str
    soc_code: str
    occupation_title: str
    area: Optional[str] = None
    wage_data: Optional[Dict[str, Any]] = None
    projection_data: Optional[Dict[str, Any]] = None
    tone: str = "formal"  # formal, concise, detailed


class LMINarrativeResponse(BaseModel):
    """Response from LMI narrative generation."""
    narrative: str
    word_count: int = 0
    success: bool = True
    error: Optional[str] = None


@router.post("/chat", response_model=ChatResponse)
@limiter.limit(RATE_LIMITS["ai_chat"])
async def chat_with_ai(
    request: Request,
    chat_request: ChatRequest,
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Chat with the AI curriculum assistant.

    This endpoint allows users to have a conversation with the AI assistant
    for curriculum development help.

    Rate limit: 30 requests/minute per user.
    """
    try:
        service = get_gemini_service()

        # Convert history to expected format
        history = None
        if chat_request.history:
            history = [{"role": msg.role, "content": msg.content} for msg in chat_request.history]

        result = await service.chat(
            message=chat_request.message,
            history=history,
            course_context=chat_request.course_context
        )

        return ChatResponse(
            text=result.get("text", ""),
            citations=result.get("citations", []),
            success=result.get("success", True),
            error=result.get("error")
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


@router.post("/suggest/catalog-description", response_model=ChatResponse)
@limiter.limit(RATE_LIMITS["ai_generation"])
async def suggest_catalog_description(
    request: Request,
    desc_request: CatalogDescriptionRequest,
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Generate a catalog description suggestion.

    Provides an AI-generated catalog description following California CC style guidelines.

    Rate limit: 10 requests/minute per user.
    """
    try:
        service = get_gemini_service()

        result = await service.suggest_catalog_description(
            course_title=desc_request.course_title,
            subject_code=desc_request.subject_code,
            course_number=desc_request.course_number,
            units=desc_request.units,
            existing_description=desc_request.existing_description,
            slos=desc_request.slos
        )

        return ChatResponse(
            text=result.get("text", ""),
            citations=result.get("citations", []),
            success=result.get("success", True),
            error=result.get("error")
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


@router.post("/suggest/slos", response_model=ChatResponse)
@limiter.limit(RATE_LIMITS["ai_generation"])
async def suggest_slos(
    request: Request,
    slo_request: SLORequest,
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Generate SLO suggestions using Bloom's Taxonomy.

    Provides AI-generated Student Learning Outcomes that follow best practices.

    Rate limit: 10 requests/minute per user.
    """
    try:
        service = get_gemini_service()

        result = await service.suggest_slos(
            course_title=slo_request.course_title,
            subject_code=slo_request.subject_code,
            catalog_description=slo_request.catalog_description,
            existing_slos=slo_request.existing_slos,
            num_suggestions=slo_request.num_suggestions
        )

        return ChatResponse(
            text=result.get("text", ""),
            citations=result.get("citations", []),
            success=result.get("success", True),
            error=result.get("error")
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


@router.post("/explain/compliance", response_model=ChatResponse)
@limiter.limit(RATE_LIMITS["ai_explain"])
async def explain_compliance(
    request: Request,
    compliance_request: ComplianceExplainRequest,
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Explain a compliance issue and how to fix it.

    Provides detailed explanation of curriculum compliance requirements with citations.

    Rate limit: 30 requests/minute per user.
    """
    try:
        service = get_gemini_service()

        result = await service.explain_compliance(
            issue_type=compliance_request.issue_type,
            context=compliance_request.context
        )

        return ChatResponse(
            text=result.get("text", ""),
            citations=result.get("citations", []),
            success=result.get("success", True),
            error=result.get("error")
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


@router.post("/suggest/content-outline", response_model=ContentOutlineResponse)
@limiter.limit(RATE_LIMITS["ai_generation"])
async def suggest_content_outline(
    request: Request,
    outline_request: ContentOutlineRequest,
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Generate a content outline suggestion for a course.

    Creates an AI-generated content outline that:
    - Contains 10-15 topics with logical sequencing
    - Allocates hours that sum to the specified contact hours
    - Links topics to Student Learning Outcomes
    - Includes subtopics for detailed breakdown

    Rate limit: 10 requests/minute per user.
    """
    import json
    import re

    try:
        service = get_gemini_service()

        result = await service.suggest_content_outline(
            course_title=outline_request.course_title,
            subject_code=outline_request.subject_code,
            contact_hours=outline_request.contact_hours,
            catalog_description=outline_request.catalog_description,
            slos=outline_request.slos,
            textbook_info=outline_request.textbook_info,
            num_topics=outline_request.num_topics
        )

        # Parse the JSON response from AI
        raw_text = result.get("text", "")
        topics = []
        total_hours = 0.0

        try:
            # Try to extract JSON from the response
            # Remove potential markdown code blocks
            json_text = raw_text.strip()
            if json_text.startswith("```"):
                # Remove markdown code fence
                json_text = re.sub(r'^```(?:json)?\n?', '', json_text)
                json_text = re.sub(r'\n?```$', '', json_text)

            parsed = json.loads(json_text)

            if isinstance(parsed, list):
                for item in parsed:
                    topic = ContentOutlineTopic(
                        sequence=item.get("sequence", 0),
                        title=item.get("title", ""),
                        description=item.get("description", ""),
                        hours=float(item.get("hours", 0)),
                        slo_alignment=item.get("slo_alignment", []),
                        subtopics=item.get("subtopics", [])
                    )
                    topics.append(topic)
                    total_hours += topic.hours

        except (json.JSONDecodeError, ValueError) as e:
            # If JSON parsing fails, return the raw text
            return ContentOutlineResponse(
                topics=[],
                total_hours=0.0,
                raw_text=raw_text,
                success=False,
                error=f"Failed to parse AI response as JSON: {str(e)}"
            )

        return ContentOutlineResponse(
            topics=topics,
            total_hours=total_hours,
            raw_text=raw_text,
            success=True
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


@router.post("/suggest/top-code", response_model=TOPCodeResponse)
@limiter.limit(RATE_LIMITS["ai_generation"])
async def suggest_top_code(
    request: Request,
    top_request: TOPCodeRequest,
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Suggest TOP (Taxonomy of Programs) codes for a course.

    Analyzes the course title and description to recommend the most
    appropriate TOP codes for CB03 state MIS reporting. Returns:
    - Top 3 matching TOP codes with confidence scores
    - Vocational status for each code
    - Brief explanation of why each code matches

    Rate limit: 10 requests/minute per user.
    """
    import json
    import re

    try:
        service = get_gemini_service()

        # Fetch available TOP codes from database for AI context
        from sqlmodel import Session, select
        from app.core.database import engine
        from app.models.reference import TOPCode

        existing_top_codes = []
        try:
            with Session(engine) as session:
                statement = select(TOPCode).limit(100)
                top_codes = session.exec(statement).all()
                existing_top_codes = [
                    {
                        "code": tc.code,
                        "title": tc.title,
                        "is_vocational": tc.is_vocational
                    }
                    for tc in top_codes
                ]
        except Exception:
            # Continue without TOP codes if database query fails
            pass

        result = await service.suggest_top_code(
            course_title=top_request.course_title,
            course_description=top_request.course_description,
            existing_top_codes=existing_top_codes if existing_top_codes else None
        )

        # Parse the JSON response from AI
        raw_text = result.get("text", "")
        suggestions = []

        try:
            # Try to extract JSON from the response
            json_text = raw_text.strip()

            # Remove markdown code fence if present
            if "```" in json_text:
                # Extract content between code fences
                code_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', json_text)
                if code_match:
                    json_text = code_match.group(1).strip()
                else:
                    # Try simple removal
                    json_text = re.sub(r'^```(?:json)?\n?', '', json_text)
                    json_text = re.sub(r'\n?```$', '', json_text)

            # Try to find JSON array in the text
            if not json_text.startswith('['):
                # Look for array pattern in the text
                array_match = re.search(r'\[[\s\S]*\]', json_text)
                if array_match:
                    json_text = array_match.group(0)

            # Clean up common JSON issues from AI responses
            # Remove trailing commas before ] or }
            json_text = re.sub(r',\s*}', '}', json_text)
            json_text = re.sub(r',\s*]', ']', json_text)
            # Fix unquoted property names (common AI mistake)
            json_text = re.sub(r'(\{|\,)\s*(\w+)\s*:', r'\1 "\2":', json_text)

            # Try to parse the JSON
            parsed = None
            try:
                parsed = json.loads(json_text)
            except json.JSONDecodeError:
                # Try to repair truncated JSON by finding complete objects
                # Count complete objects in the array
                repaired_items = []
                depth = 0
                current_obj = ""
                in_string = False
                escape_next = False

                for i, char in enumerate(json_text):
                    if escape_next:
                        current_obj += char
                        escape_next = False
                        continue

                    if char == '\\' and in_string:
                        escape_next = True
                        current_obj += char
                        continue

                    if char == '"' and not escape_next:
                        in_string = not in_string
                        current_obj += char
                        continue

                    if not in_string:
                        if char == '{':
                            if depth == 0:
                                current_obj = "{"
                            else:
                                current_obj += char
                            depth += 1
                        elif char == '}':
                            depth -= 1
                            current_obj += char
                            if depth == 0:
                                # Complete object found, try to parse it
                                try:
                                    obj = json.loads(current_obj)
                                    repaired_items.append(obj)
                                except:
                                    pass
                                current_obj = ""
                        else:
                            if depth > 0:
                                current_obj += char
                    else:
                        current_obj += char

                if repaired_items:
                    parsed = repaired_items
                else:
                    raise json.JSONDecodeError("No complete objects found", json_text, 0)

            if parsed is None:
                raise json.JSONDecodeError("Failed to parse", json_text, 0)

            if isinstance(parsed, list):
                for item in parsed:
                    suggestion = TOPCodeSuggestion(
                        code=str(item.get("code", "")),
                        title=item.get("title", ""),
                        is_vocational=bool(item.get("is_vocational", False)),
                        confidence=float(item.get("confidence", 0.0)),
                        explanation=item.get("explanation", "")
                    )
                    suggestions.append(suggestion)

        except (json.JSONDecodeError, ValueError) as e:
            # If JSON parsing fails, return the raw text
            return TOPCodeResponse(
                suggestions=[],
                raw_text=raw_text,
                success=False,
                error=f"Failed to parse AI response as JSON: {str(e)}"
            )

        return TOPCodeResponse(
            suggestions=suggestions,
            raw_text=raw_text,
            success=True
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


@router.post("/suggest/program-narrative", response_model=ProgramNarrativeResponse)
@limiter.limit(RATE_LIMITS["ai_generation"])
async def suggest_program_narrative(
    request: Request,
    narrative_request: ProgramNarrativeRequest,
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Generate a program narrative for Chancellor's Office submission.

    Creates an AI-generated narrative that includes:
    - Goals and Objectives section
    - Program Requirements Justification
    - Suggested Catalog Description
    - Labor Market Analysis (for CTE programs)

    The narrative follows PCAH (Program and Course Approval Handbook) guidelines
    and is tailored to the specific program based on its courses and type.

    Rate limit: 10 requests/minute per user.
    """
    import re

    try:
        service = get_gemini_service()

        # Convert course info to dict format
        courses_data = None
        if narrative_request.courses:
            courses_data = [
                {
                    "subject_code": c.subject_code,
                    "course_number": c.course_number,
                    "title": c.title,
                    "units": c.units,
                }
                for c in narrative_request.courses
            ]

        result = await service.generate_program_narrative(
            program_title=narrative_request.program_title,
            program_type=narrative_request.program_type,
            total_units=narrative_request.total_units,
            catalog_description=narrative_request.catalog_description,
            courses=courses_data,
            department=narrative_request.department,
            top_code=narrative_request.top_code,
            is_cte=narrative_request.is_cte,
        )

        raw_text = result.get("text", "")

        # Try to parse the narrative into sections
        goals = None
        requirements = None
        catalog_desc = None
        labor_market = None

        # Extract sections using regex
        goals_match = re.search(
            r'###\s*1\.\s*Goals\s+and\s+Objectives[^\n]*\n(.*?)(?=###\s*2\.|\Z)',
            raw_text,
            re.IGNORECASE | re.DOTALL
        )
        if goals_match:
            goals = goals_match.group(1).strip()

        requirements_match = re.search(
            r'###\s*2\.\s*Program\s+Requirements\s+Justification[^\n]*\n(.*?)(?=###\s*3\.|\Z)',
            raw_text,
            re.IGNORECASE | re.DOTALL
        )
        if requirements_match:
            requirements = requirements_match.group(1).strip()

        catalog_match = re.search(
            r'###\s*3\.\s*Catalog\s+Description[^\n]*\n(.*?)(?=###\s*4\.|\Z)',
            raw_text,
            re.IGNORECASE | re.DOTALL
        )
        if catalog_match:
            catalog_desc = catalog_match.group(1).strip()

        if narrative_request.is_cte:
            labor_match = re.search(
                r'###\s*4\.\s*Labor\s+Market\s+Analysis[^\n]*\n(.*?)(?=###|\Z)',
                raw_text,
                re.IGNORECASE | re.DOTALL
            )
            if labor_match:
                labor_market = labor_match.group(1).strip()

        return ProgramNarrativeResponse(
            narrative=raw_text,
            goals_and_objectives=goals,
            requirements_justification=requirements,
            catalog_description=catalog_desc,
            labor_market_analysis=labor_market,
            success=result.get("success", True),
            error=result.get("error"),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


# =============================================================================
# RAG / Document-based AI Endpoints
# =============================================================================

from app.services.file_search_service import (
    get_file_search_service,
    get_calricula_rag_service,
    DocumentMetadata,
)


class DocumentUploadResponse(BaseModel):
    """Response from document upload."""
    file_id: str
    filename: str
    display_name: str
    document_type: str
    size_bytes: int
    success: bool = True
    error: Optional[str] = None


class RAGQueryRequest(BaseModel):
    """Request for RAG-based query."""
    query: str
    document_types: Optional[List[str]] = None
    file_ids: Optional[List[str]] = None
    include_citations: bool = True


class CitationInfo(BaseModel):
    """Citation information from RAG response."""
    text: str
    source_file: str
    section: Optional[str] = None


class RAGQueryResponse(BaseModel):
    """Response from RAG query."""
    text: str
    citations: List[CitationInfo] = []
    success: bool = True
    error: Optional[str] = None


class RegulationExplainRequest(BaseModel):
    """Request for regulation explanation."""
    regulation_reference: str  # e.g., "Title 5 § 55002.5"
    context: Optional[str] = None


class CBCodeGuidanceRequest(BaseModel):
    """Request for CB code guidance."""
    cb_code: str  # e.g., "CB03", "CB09"
    course_context: Optional[Dict[str, Any]] = None


@router.post("/rag/upload", response_model=DocumentUploadResponse)
@limiter.limit(RATE_LIMITS["ai_documents"])
async def upload_document_for_rag(
    request: Request,
    file_path: str,
    display_name: Optional[str] = None,
    document_type: str = "reference",
    current_user: User = Depends(get_current_user),
):
    """
    Upload a document for RAG indexing.

    This endpoint allows uploading curriculum-related documents (PCAH, Title 5, etc.)
    that will be used to ground AI responses in authoritative sources.

    Requires authentication.
    Rate limit: 20 requests/minute per user.
    """
    try:
        service = get_file_search_service()
        metadata = await service.upload_document(
            file_path=file_path,
            display_name=display_name,
            document_type=document_type,
        )

        return DocumentUploadResponse(
            file_id=metadata.file_id,
            filename=metadata.filename,
            display_name=metadata.display_name,
            document_type=metadata.document_type,
            size_bytes=metadata.size_bytes,
            success=True,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/rag/documents")
async def list_rag_documents(
    document_type: Optional[str] = None,
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    List all uploaded RAG documents.

    Optionally filter by document_type (regulation, template, course_outline).
    """
    try:
        service = get_file_search_service()
        documents = service.list_uploaded_documents(document_type=document_type)

        return {
            "documents": [
                {
                    "file_id": doc.file_id,
                    "filename": doc.filename,
                    "display_name": doc.display_name,
                    "document_type": doc.document_type,
                    "size_bytes": doc.size_bytes,
                    "upload_time": doc.upload_time.isoformat(),
                    "tags": doc.tags,
                }
                for doc in documents
            ],
            "total": len(documents),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list documents: {str(e)}")


@router.delete("/rag/documents/{file_id}")
@limiter.limit(RATE_LIMITS["ai_documents"])
async def delete_rag_document(
    request: Request,
    file_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Delete an uploaded RAG document.

    Requires authentication.
    Rate limit: 20 requests/minute per user.
    """
    try:
        service = get_file_search_service()
        success = await service.delete_document(file_id)

        if not success:
            raise HTTPException(status_code=404, detail="Document not found or deletion failed")

        return {"success": True, "file_id": file_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Deletion failed: {str(e)}")


@router.post("/rag/query", response_model=RAGQueryResponse)
@limiter.limit(RATE_LIMITS["ai_rag"])
async def query_with_rag(
    request: Request,
    rag_request: RAGQueryRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Query the AI with RAG (Retrieval Augmented Generation).

    The AI will ground its response in uploaded documents and provide citations.

    Rate limit: 20 requests/minute per user.
    """
    try:
        service = get_calricula_rag_service()
        response = await service.generate_with_rag(
            query=rag_request.query,
            file_ids=rag_request.file_ids,
            document_types=rag_request.document_types,
            include_citations=rag_request.include_citations,
        )

        return RAGQueryResponse(
            text=response.text,
            citations=[
                CitationInfo(
                    text=c.text,
                    source_file=c.source_file,
                    section=c.section,
                )
                for c in response.citations
            ],
            success=response.success,
            error=response.error,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RAG query failed: {str(e)}")


@router.post("/rag/explain-regulation", response_model=RAGQueryResponse)
@limiter.limit(RATE_LIMITS["ai_explain"])
async def explain_regulation(
    request: Request,
    reg_request: RegulationExplainRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Get an explanation of a specific curriculum regulation.

    Searches PCAH and Title 5 documents to provide authoritative guidance.

    Rate limit: 30 requests/minute per user.
    """
    try:
        service = get_calricula_rag_service()
        response = await service.explain_regulation(
            regulation_reference=reg_request.regulation_reference,
            context=reg_request.context,
        )

        return RAGQueryResponse(
            text=response.text,
            citations=[
                CitationInfo(
                    text=c.text,
                    source_file=c.source_file,
                    section=c.section,
                )
                for c in response.citations
            ],
            success=response.success,
            error=response.error,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Regulation explanation failed: {str(e)}")


@router.post("/rag/cb-code-guidance", response_model=RAGQueryResponse)
@limiter.limit(RATE_LIMITS["ai_explain"])
async def get_cb_code_guidance(
    request: Request,
    cb_request: CBCodeGuidanceRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Get guidance on a specific CB code.

    Returns information about valid values, dependencies, and common issues.

    Rate limit: 30 requests/minute per user.
    """
    try:
        service = get_calricula_rag_service()
        response = await service.get_cb_code_guidance(
            cb_code=cb_request.cb_code,
            course_context=cb_request.course_context,
        )

        return RAGQueryResponse(
            text=response.text,
            citations=[
                CitationInfo(
                    text=c.text,
                    source_file=c.source_file,
                    section=c.section,
                )
                for c in response.citations
            ],
            success=response.success,
            error=response.error,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CB code guidance failed: {str(e)}")


@router.post("/rag/search")
@limiter.limit(RATE_LIMITS["ai_rag"])
async def search_documents(
    request: Request,
    query: str,
    file_ids: Optional[List[str]] = None,
    max_results: int = 5,
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Search across uploaded documents for relevant passages.

    Returns matching text passages with source information.

    Rate limit: 20 requests/minute per user.
    """
    try:
        service = get_file_search_service()
        results = await service.search_documents(
            query=query,
            file_ids=file_ids,
            max_results=max_results,
        )

        return {
            "query": query,
            "results": results,
            "total": len(results),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Document search failed: {str(e)}")


@router.post("/suggest-occupations", response_model=LMIOccupationSuggestResponse)
@limiter.limit(RATE_LIMITS["ai_generation"])
async def suggest_lmi_occupations(
    request: Request,
    suggest_request: LMIOccupationSuggestRequest,
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Suggest relevant occupations based on course content analysis.

    This endpoint analyzes course information (title, description, objectives, SLOs)
    and suggests relevant SOC occupations that graduates would be prepared for.

    Used by CTE (Career Technical Education) courses to populate LMI data.

    Rate limit: 10 requests/minute per user.
    """
    import json
    import logging

    logger = logging.getLogger(__name__)

    try:
        service = get_gemini_service()

        # Build a comprehensive course description for analysis
        course_summary = f"Course: {suggest_request.course_title}"
        if suggest_request.course_description:
            course_summary += f"\nDescription: {suggest_request.course_description}"
        if suggest_request.objectives:
            course_summary += f"\nObjectives:\n" + "\n".join(suggest_request.objectives)
        if suggest_request.slos:
            course_summary += f"\nStudent Learning Outcomes:\n" + "\n".join(suggest_request.slos)
        if suggest_request.top_code:
            course_summary += f"\nTOP Code: {suggest_request.top_code}"
        if suggest_request.department:
            course_summary += f"\nDepartment: {suggest_request.department}"

        prompt = f"""You are an expert in occupational classification and the Standard Occupational Classification (SOC) system.

Analyze the following course and suggest 3 relevant SOC occupations that graduates would be prepared for.

{course_summary}

For each suggestion, provide:
1. SOC Code (6-digit format: XX-XXXX)
2. Occupation Title
3. Confidence score (0.0 to 1.0, where 1.0 is perfect match)
4. Brief rationale (ONE sentence only, max 15 words)

Return your response as a JSON array with this exact structure:
[
  {{"soc_code": "29-1141", "title": "Registered Nurses", "confidence": 0.95, "rationale": "Course aligns with RN competencies."}},
  {{"soc_code": "29-2061", "title": "Licensed Practical Nurses", "confidence": 0.85, "rationale": "Covers foundational nursing skills."}}
]

IMPORTANT: Return ONLY valid JSON. No markdown, no extra text. Keep rationales very short."""

        logger.info(f"Calling Gemini API for occupation suggestions for course: {suggest_request.course_title}")
        result = await service.call_gemini(
            prompt=prompt,
            max_tokens=2000,
            temperature=0.5
        )

        logger.info(f"Gemini response received: {len(result)} chars")

        # Clean up the response - remove markdown code blocks if present
        cleaned_result = result.strip()
        if cleaned_result.startswith("```json"):
            cleaned_result = cleaned_result[7:]
        elif cleaned_result.startswith("```"):
            cleaned_result = cleaned_result[3:]
        if cleaned_result.endswith("```"):
            cleaned_result = cleaned_result[:-3]
        cleaned_result = cleaned_result.strip()

        # Try to find valid JSON array in the response
        if "[" in cleaned_result and "]" in cleaned_result:
            start_idx = cleaned_result.find("[")
            end_idx = cleaned_result.rfind("]") + 1
            cleaned_result = cleaned_result[start_idx:end_idx]

        # Parse the response
        try:
            suggestions_data = json.loads(cleaned_result)
            suggestions = [OccupationSuggestion(**item) for item in suggestions_data]
            logger.info(f"Successfully parsed {len(suggestions)} occupation suggestions")
            return LMIOccupationSuggestResponse(suggestions=suggestions, success=True)
        except json.JSONDecodeError as je:
            logger.error(f"JSON parse error: {str(je)}\nCleaned response: {cleaned_result[:500]}\nOriginal: {result[:300]}")
            return LMIOccupationSuggestResponse(
                suggestions=[],
                success=False,
                error="Failed to parse occupation suggestions from AI response"
            )

    except Exception as e:
        logger.exception(f"Unexpected error in suggest_lmi_occupations: {str(e)}")
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


@router.post("/generate-lmi-narrative", response_model=LMINarrativeResponse)
@limiter.limit(RATE_LIMITS["ai_generation"])
async def generate_lmi_narrative(
    request: Request,
    narrative_request: LMINarrativeRequest,
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Generate a narrative describing labor market information for a course.

    This endpoint generates text describing career outcomes, labor demand, and
    wage information for a specific occupation related to a CTE course.

    The narrative can be used in course marketing, program descriptions, and
    accreditation documentation.

    Rate limit: 10 requests/minute per user.
    """
    try:
        service = get_gemini_service()

        # Extract wage and projection data
        wage_summary = ""
        if narrative_request.wage_data:
            wage = narrative_request.wage_data
            if wage.get("annual_median"):
                wage_summary += f"Median annual salary: ${wage['annual_median']:,.0f}. "
            if wage.get("employment"):
                wage_summary += f"Current employment: {wage['employment']:,}. "

        projection_summary = ""
        if narrative_request.projection_data:
            proj = narrative_request.projection_data
            if proj.get("percent_change"):
                projection_summary += f"Employment growth: {proj['percent_change']:+.1f}%. "
            if proj.get("total_openings"):
                projection_summary += f"Annual job openings: {proj['total_openings']:,}. "
            if proj.get("entry_level_education"):
                projection_summary += f"Required education: {proj['entry_level_education']}. "

        # Select tone-specific guidance with explicit word counts
        tone_guidance = {
            "formal": "Write exactly 150-175 words in a formal, professional tone appropriate for regulatory submission. Use objective language.",
            "concise": "Write exactly 75-100 words. Be brief and focus only on key labor market facts.",
            "detailed": "Write exactly 250-300 words with comprehensive analysis. Include multiple aspects of the labor market in depth."
        }

        tone = narrative_request.tone or "formal"
        tone_instruction = tone_guidance.get(tone, tone_guidance["formal"])

        prompt = f"""You are an expert in labor market analysis and community college curriculum documentation.

Generate a labor market information narrative for the following occupation and course:

Course Title: {narrative_request.course_title}
Occupation: {narrative_request.occupation_title}
SOC Code: {narrative_request.soc_code}
Geographic Area: {narrative_request.area or "California"}

Labor Market Data:
{wage_summary or "Wage data not available"}
{projection_summary or "Projection data not available"}

Instructions:
- {tone_instruction}
- Include the SOC code and occupation title
- Reference the geographic area
- Highlight job growth and employment demand
- Mention wage/salary information if available
- Explain alignment with educational requirements
- Make it suitable for inclusion in course catalogs and program proposals
- IMPORTANT: Write a complete narrative with proper sentences. Do not cut off mid-sentence.

Generate the complete narrative now:"""

        # Token limits with generous buffer to prevent cutoff
        token_limits = {
            "concise": 800,
            "formal": 1000,
            "detailed": 1500
        }

        result = await service.call_gemini(
            prompt=prompt,
            max_tokens=token_limits.get(tone, 700),
            temperature=0.7
        )

        # Count words
        word_count = len(result.split())

        return LMINarrativeResponse(
            narrative=result,
            word_count=word_count,
            success=True
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


@router.get("/health")
async def ai_health_check():
    """Check if AI service is available."""
    try:
        service = get_gemini_service()
        service._ensure_configured()
        return {"status": "healthy", "service": "gemini", "model": service.model_name}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}
