"""
Gemini AI Service for Calricula

Provides AI-assisted curriculum development features using Google Gemini 2.0 Flash
with the new google-genai SDK.

Migrated from deprecated google.generativeai package to google.genai.
"""

import os
import logging
from typing import Optional, List, Dict, Any
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

# System prompt for curriculum assistant
CURRICULUM_ASSISTANT_SYSTEM_PROMPT = """
You are an expert AI Curriculum Design Assistant for community colleges.
Your role is to help faculty create high-quality, compliant Course Outlines of Record (CORs)
and academic programs.

## Your Expertise
- community college curriculum regulations (Title 5, PCAH)
- Course Outline of Record (COR) development
- Student Learning Outcomes (SLOs) using Bloom's Taxonomy
- CB Code requirements for state reporting
- Common Course Numbering (CCN/C-ID) alignment
- Transfer requirements (UC, CSU, Cal-GETC)
- Career Technical Education (CTE) requirements
- Accreditation standards (ACCJC)

## Your Approach
1. **Be Collaborative**: Work WITH the faculty member, not for them. Ask clarifying questions.
2. **Be Specific**: Provide concrete suggestions, not vague advice.
3. **Cite Regulations**: When mentioning compliance requirements, cite the specific regulation.
4. **Use Their Materials**: Reference the documents they've uploaded for context.
5. **Maintain Academic Voice**: Use formal, professional language appropriate for official documents.
6. **Focus on Students**: Frame outcomes around what students will learn and be able to do.

## Writing Style for Curriculum Documents
- Catalog descriptions: Active voice, present tense, ~50 words, student-focused
- SLOs: Start with measurable action verbs (Bloom's Taxonomy), be specific and observable
- Content outlines: Clear topic hierarchy, appropriate depth for the unit value
- Avoid weak verbs: Do NOT use "understand", "know", "learn", "appreciate", "become familiar with"

## Compliance Awareness
- Always check that unit calculations follow the 54-hour rule (Total Hours / 54 = Units)
- Ensure CB codes are internally consistent (e.g., CB09 depends on CB03)
- Flag potential transfer issues early
- Remind users about prerequisite Content Review requirements

## When Helping with Specific Tasks
- **Catalog Description**: Ask about target students, key topics, and what makes this course unique
- **SLOs**: Ask what students should be able to DO after completing the course
- **Content Outline**: Ask about the textbook, key topics, and time allocation
- **Prerequisites**: Ask about required entry skills and how they connect to this course

Always prioritize the user's context and course details when making suggestions.
"""


def get_api_key() -> str:
    """Get Google API key from settings or environment."""
    # First try from settings (which loads from .env file)
    from app.core.config import settings
    if settings.GOOGLE_API_KEY and not settings.GOOGLE_API_KEY.startswith("AIzaSy..."):
        return settings.GOOGLE_API_KEY

    # Fallback to environment variable
    api_key = os.getenv("GOOGLE_API_KEY")
    if api_key and not api_key.startswith("AIzaSy..."):
        return api_key

    # Try reading from file
    api_key_path = "/tmp/google-api-key"
    if os.path.exists(api_key_path):
        with open(api_key_path, "r") as f:
            return f.read().strip()

    raise ValueError("Google API key not found. Set GOOGLE_API_KEY environment variable.")


class GeminiService:
    """Service for interacting with Google Gemini AI using the new google-genai SDK."""

    def __init__(self):
        self.client: Optional[genai.Client] = None
        self.model_name = "gemini-2.5-flash-lite"  # Use Gemini 2.5 Flash Lite
        self._configured = False

    def _ensure_configured(self):
        """Ensure Gemini API client is initialized."""
        if not self._configured or self.client is None:
            api_key = get_api_key()
            self.client = genai.Client(api_key=api_key)
            self._configured = True

    async def generate_response(
        self,
        prompt: str,
        context: Optional[Dict[str, Any]] = None,
        system_prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate a response from Gemini.

        Args:
            prompt: User's message/query
            context: Optional context dict with course info, etc.
            system_prompt: Optional custom system prompt (defaults to curriculum assistant)

        Returns:
            Dict with 'text' response and 'citations' if any
        """
        self._ensure_configured()

        # Build full prompt with system instructions
        if system_prompt is None:
            system_prompt = CURRICULUM_ASSISTANT_SYSTEM_PROMPT

        # Add context to prompt if provided
        context_str = ""
        if context:
            context_str = "\n\n## Current Context\n"
            if context.get("course_code"):
                context_str += f"- Course: {context.get('course_code')} - {context.get('course_title', '')}\n"
            if context.get("department"):
                context_str += f"- Department: {context.get('department')}\n"
            if context.get("units"):
                context_str += f"- Units: {context.get('units')}\n"
            if context.get("current_section"):
                context_str += f"- Currently editing: {context.get('current_section')}\n"
            if context.get("existing_slos"):
                context_str += f"- Existing SLOs: {len(context.get('existing_slos', []))}\n"
            if context.get("catalog_description"):
                context_str += f"- Catalog description: {context.get('catalog_description')[:200]}...\n"

        full_prompt = f"{system_prompt}{context_str}\n\n---\n\nUser request: {prompt}"

        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=full_prompt,
                config=types.GenerateContentConfig(
                    temperature=0.7,
                    max_output_tokens=4096,
                )
            )

            return {
                "text": response.text,
                "citations": [],
                "model": self.model_name,
                "success": True
            }
        except Exception as e:
            logger.error(f"Gemini API error: {str(e)}")
            return {
                "text": f"I apologize, but I encountered an error: {str(e)}. Please try again.",
                "citations": [],
                "model": self.model_name,
                "success": False,
                "error": str(e)
            }

    async def suggest_catalog_description(
        self,
        course_title: str,
        subject_code: str,
        course_number: str,
        units: float,
        existing_description: Optional[str] = None,
        slos: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Generate a catalog description suggestion.

        Args:
            course_title: Title of the course
            subject_code: Subject code (e.g., "MATH")
            course_number: Course number (e.g., "101")
            units: Number of units
            existing_description: Current description to improve (if any)
            slos: List of SLOs for context

        Returns:
            Dict with suggested description
        """
        context = {
            "course_code": f"{subject_code} {course_number}",
            "course_title": course_title,
            "units": units
        }

        prompt = f"""Generate a catalog description for this course:

Subject: {subject_code}
Course Number: {course_number}
Title: {course_title}
Units: {units}

"""
        if existing_description:
            prompt += f"""Current description to improve:
{existing_description}

Please improve this description while maintaining its key information.
"""

        if slos:
            prompt += f"""Student Learning Outcomes for context:
{chr(10).join(f'- {slo}' for slo in slos)}

"""

        prompt += """Generate a catalog description that:
- Uses active voice and present tense
- Is approximately 50 words
- Focuses on what students will learn and be able to do
- Is specific to the discipline and course content
- Does NOT start with phrases like "This course..." or "Students will..."
- Instead, starts directly with what the course covers

Provide ONLY the catalog description text, no explanation."""

        result = await self.generate_response(prompt, context)
        return result

    async def suggest_slos(
        self,
        course_title: str,
        subject_code: str,
        catalog_description: Optional[str] = None,
        existing_slos: Optional[List[str]] = None,
        num_suggestions: int = 3
    ) -> Dict[str, Any]:
        """
        Generate SLO suggestions using Bloom's Taxonomy.

        Args:
            course_title: Title of the course
            subject_code: Subject code
            catalog_description: Course description for context
            existing_slos: Current SLOs to avoid duplicates
            num_suggestions: Number of SLOs to suggest

        Returns:
            Dict with list of suggested SLOs
        """
        context = {
            "course_title": course_title,
            "department": subject_code
        }

        prompt = f"""Generate {num_suggestions} Student Learning Outcomes (SLOs) for this course:

Course: {subject_code} - {course_title}
"""

        if catalog_description:
            prompt += f"""Catalog Description:
{catalog_description}

"""

        if existing_slos:
            prompt += f"""Existing SLOs (avoid duplicating these):
{chr(10).join(f'- {slo}' for slo in existing_slos)}

"""

        prompt += """Generate SLOs that:
1. Start with a measurable action verb from Bloom's Taxonomy (Analyze, Evaluate, Create, Apply, Compare, Design, etc.)
2. Are specific and observable
3. Focus on what students will be able to DO after completing the course
4. Cover different cognitive levels (not all at the same level)
5. Do NOT use weak verbs like "understand", "know", "learn", "appreciate"

Format each SLO on its own line, starting with a number and period.
Example format:
1. Analyze economic principles to evaluate market behavior and predict outcomes.
2. Design scientific experiments using the hypothesis-testing methodology.
3. Evaluate literary works by applying critical analysis frameworks.

Provide ONLY the numbered SLOs, no additional explanation."""

        result = await self.generate_response(prompt, context)
        return result

    async def explain_compliance(
        self,
        issue_type: str,
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Explain a compliance issue and how to fix it.

        Args:
            issue_type: Type of compliance issue (e.g., "unit_calculation", "cb_code_conflict")
            context: Context about the issue

        Returns:
            Dict with explanation and suggested fix
        """
        prompts = {
            "unit_calculation": f"""Explain the community college 54-hour rule for unit calculation.

Current values:
- Units: {context.get('units', 'N/A')}
- Lecture Hours: {context.get('lecture_hours', 'N/A')}
- Lab Hours: {context.get('lab_hours', 'N/A')}
- Total Hours: {context.get('total_hours', 'N/A')}

The formula is: Total Student Hours = (Lecture Hours × 18) + (Lab Hours × 54) + Homework Hours
And: Units = Total Student Hours / 54

Explain what's wrong and how to fix it. Be specific with the math.""",

            "cb_code_conflict": f"""Explain the CB code dependency conflict.

Issue: {context.get('issue', 'CB code values are inconsistent')}
Current values: {context.get('cb_codes', {})}

Common CB code dependencies:
- CB09 (SAM Code) depends on CB03 (TOP Code): If non-vocational TOP code, SAM must be 'E'
- CB05 (Transfer Status) affects articulation options
- CB08 (Basic Skills) affects CB21 (Prior to College Level)

Explain the conflict and how to resolve it. Cite the relevant regulation (PCAH or Title 5).""",

            "weak_verb": f"""The SLO uses a weak/non-measurable verb.

SLO: {context.get('slo_text', '')}
Weak verb detected: {context.get('weak_verb', '')}

Explain why this verb is problematic for SLOs and suggest 3 alternative stronger verbs from Bloom's Taxonomy that could replace it. Provide a rewritten version of the SLO."""
        }

        prompt = prompts.get(issue_type, f"Explain this compliance issue: {issue_type}\nContext: {context}")

        return await self.generate_response(prompt)

    async def suggest_content_outline(
        self,
        course_title: str,
        subject_code: str,
        contact_hours: float,
        catalog_description: Optional[str] = None,
        slos: Optional[List[str]] = None,
        textbook_info: Optional[str] = None,
        num_topics: int = 12
    ) -> Dict[str, Any]:
        """
        Generate a course content outline from description and SLOs.

        Args:
            course_title: Title of the course
            subject_code: Subject code (e.g., "MATH")
            contact_hours: Total contact hours for the course
            catalog_description: Course description for context
            slos: List of SLOs to align topics with
            textbook_info: Optional textbook or syllabus information
            num_topics: Target number of topics (default 12)

        Returns:
            Dict with suggested content outline including topics and hour allocations
        """
        context = {
            "course_title": course_title,
            "department": subject_code,
            "contact_hours": contact_hours
        }

        prompt = f"""Generate a course content outline for this community college course:

Course: {subject_code} - {course_title}
Total Contact Hours: {contact_hours} hours (to be distributed across all topics)
Target Topics: {num_topics} main topics

"""
        if catalog_description:
            prompt += f"""Catalog Description:
{catalog_description}

"""

        if slos:
            prompt += f"""Student Learning Outcomes (SLOs) - topics MUST align with these:
{chr(10).join(f'{i+1}. {slo}' for i, slo in enumerate(slos))}

"""

        if textbook_info:
            prompt += f"""Textbook/Course Materials:
{textbook_info}

"""

        prompt += f"""Generate a comprehensive course content outline that:
1. Contains approximately {num_topics} main topics (can have subtopics)
2. Distributes EXACTLY {contact_hours} total hours across all topics (hours must sum to {contact_hours})
3. Links each topic to at least one SLO number (if SLOs provided)
4. Orders topics in a logical pedagogical sequence
5. Includes appropriate depth for a college-level course
6. Allocates more hours to complex or foundational topics

Format your response as a JSON array with this structure:
[
  {{
    "sequence": 1,
    "title": "Topic Title",
    "description": "Brief description of what this topic covers",
    "hours": 4.5,
    "slo_alignment": [1, 3],
    "subtopics": ["Subtopic 1", "Subtopic 2"]
  }},
  ...
]

IMPORTANT:
- Hours MUST be numbers (not strings) and MUST sum to exactly {contact_hours}
- slo_alignment should be an array of SLO numbers (1-indexed) that this topic addresses
- Include subtopics as an array of strings for detailed breakdown
- sequence should be the order number (1, 2, 3, etc.)

Provide ONLY the JSON array, no additional explanation or markdown code blocks."""

        result = await self.generate_response(prompt, context)
        return result

    async def suggest_top_code(
        self,
        course_title: str,
        course_description: Optional[str] = None,
        existing_top_codes: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Suggest TOP (Taxonomy of Programs) codes for a course based on title and description.

        Args:
            course_title: Title of the course
            course_description: Course description for context
            existing_top_codes: List of available TOP codes to choose from

        Returns:
            Dict with suggested TOP codes, confidence scores, and explanations
        """
        context = {
            "course_title": course_title,
        }

        # Build the prompt
        prompt = f"""You are an expert at classifying community college courses according to the
Taxonomy of Programs (TOP) coding system. TOP codes are used for state MIS reporting (CB03) and
determine whether a course is vocational or non-vocational.

Analyze this course and suggest the most appropriate TOP code(s):

Course Title: {course_title}
"""
        if course_description:
            prompt += f"""Course Description:
{course_description}

"""

        # Add available TOP codes if provided
        if existing_top_codes:
            prompt += """Available TOP Codes (select from these):
"""
            for code in existing_top_codes[:50]:  # Limit to avoid token overflow
                voc_status = "Vocational" if code.get("is_vocational") else "Non-Vocational"
                prompt += f"- {code.get('code')}: {code.get('title')} ({voc_status})\n"
            prompt += "\n"

        prompt += """Based on the course information, provide the top 3 most appropriate TOP codes.

Format your response as a JSON array with EXACTLY this structure (keep explanations under 50 words):
[
  {"code": "1701.00", "title": "Mathematics, General", "is_vocational": false, "confidence": 0.95, "explanation": "Brief reason."},
  {"code": "1702.00", "title": "Statistics", "is_vocational": false, "confidence": 0.80, "explanation": "Brief reason."},
  {"code": "1703.00", "title": "Applied Math", "is_vocational": false, "confidence": 0.70, "explanation": "Brief reason."}
]

KEY RULES:
- TOP codes 09xx, 10xx, 12xx, 30xx-35xx, 47xx-49xx are VOCATIONAL
- TOP codes 15xx, 17xx, 19xx, 20xx, 22xx are NON-VOCATIONAL (academic)
- Keep explanation under 50 words each
- Return ONLY the JSON array, no markdown code blocks"""

        result = await self.generate_response(prompt, context)
        return result

    async def generate_program_narrative(
        self,
        program_title: str,
        program_type: str,
        total_units: float,
        catalog_description: Optional[str] = None,
        courses: Optional[List[Dict[str, Any]]] = None,
        department: Optional[str] = None,
        top_code: Optional[str] = None,
        is_cte: bool = False,
    ) -> Dict[str, Any]:
        """
        Generate a program narrative for Chancellor's Office submissions.

        Args:
            program_title: Title of the program
            program_type: Type (AA, AS, AA-T, AS-T, Certificate, ADT)
            total_units: Total units required
            catalog_description: Current catalog description
            courses: List of courses in the program with their details
            department: Owning department
            top_code: TOP code if assigned
            is_cte: Whether this is a CTE/vocational program

        Returns:
            Dict with generated narrative sections
        """
        context = {
            "program_title": program_title,
            "department": department or "Unknown",
            "units": total_units,
        }

        # Build course list for context
        course_list = ""
        if courses:
            for course in courses[:15]:  # Limit to avoid token overflow
                course_list += f"- {course.get('subject_code', '')} {course.get('course_number', '')}: {course.get('title', '')} ({course.get('units', 0)} units)\n"

        prompt = f"""Generate a comprehensive program narrative for submission to the community colleges Chancellor's Office.

## Program Information
- **Title:** {program_title}
- **Type:** {program_type}
- **Total Units:** {total_units}
- **Department:** {department or 'Not specified'}
- **TOP Code:** {top_code or 'Not assigned'}
- **CTE Program:** {'Yes' if is_cte else 'No'}

"""
        if catalog_description:
            prompt += f"""## Current Catalog Description
{catalog_description}

"""

        if course_list:
            prompt += f"""## Program Courses
{course_list}

"""

        prompt += """## Required Narrative Sections

Generate the following sections for the program narrative. Each section should be professional,
substantive, and aligned with PCAH (Program and Course Approval Handbook) requirements.

### 1. Goals and Objectives (2-3 paragraphs)
Describe the program's educational goals and what students will achieve. Include:
- Clear statement of the program's purpose
- Alignment with the college mission
- Career pathways or transfer opportunities
- How the program serves student and community needs

### 2. Program Requirements Justification (1-2 paragraphs)
Explain why the specific courses and units are required:
- How courses build upon each other
- Why the unit requirement is appropriate
- Any field-specific accreditation or licensing requirements
- Connection between coursework and program outcomes

### 3. Catalog Description (approximately 75 words)
A concise description for the college catalog that:
- States what students will learn and be able to do
- Identifies target careers or transfer pathways
- Uses active voice and present tense
- Appeals to prospective students

"""

        if is_cte:
            prompt += """### 4. Labor Market Analysis (for CTE programs only)
Summarize the labor market demand:
- Employment outlook and growth projections
- Regional/local job opportunities
- Typical entry-level positions
- Potential salary ranges

"""

        prompt += """Format your response with clear section headings using markdown (### Section Name).
Make the content substantive, specific to this program, and ready for submission.
Do not include placeholder text or generic statements - write content specific to this program based on its courses and goals."""

        result = await self.generate_response(prompt, context)
        return result

    async def call_gemini(
        self,
        prompt: str,
        max_tokens: int = 2048,
        temperature: float = 0.7
    ) -> str:
        """
        Call Gemini with a raw prompt (no system prompt wrapping).

        Used by LMI AI endpoints that need direct control over prompts.

        Args:
            prompt: The complete prompt to send
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature (0.0-1.0)

        Returns:
            Raw text response from Gemini
        """
        self._ensure_configured()

        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=temperature,
                    max_output_tokens=max_tokens,
                )
            )

            # Debug logging
            logger.info(f"Gemini response - model: {self.model_name}, max_tokens: {max_tokens}")
            if hasattr(response, 'candidates') and response.candidates:
                candidate = response.candidates[0]
                if hasattr(candidate, 'finish_reason'):
                    logger.info(f"Gemini finish_reason: {candidate.finish_reason}")
                if hasattr(candidate, 'content') and candidate.content:
                    text_len = len(response.text) if response.text else 0
                    logger.info(f"Gemini response length: {text_len} chars")

            return response.text

        except Exception as e:
            logger.error(f"Gemini API error in call_gemini: {str(e)}")
            raise Exception(f"AI generation failed: {str(e)}")

    async def chat(
        self,
        message: str,
        history: Optional[List[Dict[str, str]]] = None,
        course_context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Handle a chat message with optional history and context.

        Args:
            message: User's message
            history: Previous messages in format [{"role": "user"|"assistant", "content": "..."}]
            course_context: Optional course context

        Returns:
            Dict with response text
        """
        # Build prompt with history
        full_prompt = ""

        if history:
            full_prompt += "## Previous conversation:\n"
            for msg in history[-10:]:  # Last 10 messages for context
                role = "User" if msg.get("role") == "user" else "Assistant"
                full_prompt += f"{role}: {msg.get('content', '')}\n\n"
            full_prompt += "---\n\n"

        full_prompt += f"User: {message}"

        return await self.generate_response(full_prompt, course_context)


# Singleton instance
_gemini_service: Optional[GeminiService] = None


def get_gemini_service() -> GeminiService:
    """Get singleton GeminiService instance."""
    global _gemini_service
    if _gemini_service is None:
        _gemini_service = GeminiService()
    return _gemini_service
