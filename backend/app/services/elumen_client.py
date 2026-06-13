"""
eLumen API Client
==================

Client for accessing LACCD eLumen curriculum data via the public API.

This provides access to:
- Courses: Course Outlines of Record (CORs) across all 9 LACCD colleges
- Programs: Degrees, certificates, and certificates of achievement
- Tenants: List of LACCD colleges (ELAC, LACC, LAHC, LAMC, LAPC, LASC, LATTC, LAVC, WLAC)

The public API provides read-only access to approved curriculum data.
No authentication is required for public endpoints.
"""

import json
from typing import Optional, AsyncIterator
from enum import Enum

import httpx
from pydantic import BaseModel, Field


# API Configuration
BASE_URL = "https://portalapi-laccd.elumenapp.com"
DEFAULT_PAGE_SIZE = 100
REQUEST_TIMEOUT = 30.0
MAX_RETRIES = 3


# College abbreviation mapping
TENANT_ABBREV_MAP = {
    "elac.elumenapp.com": "ELAC",
    "lacc.elumenapp.com": "LACC",
    "lahc.elumenapp.com": "LAHC",
    "lamission.elumenapp.com": "LAMC",
    "pierce.elumenapp.com": "LAPC",
    "lasc.elumenapp.com": "LASC",
    "lattc.elumenapp.com": "LATTC",
    "lavc.elumenapp.com": "LAVC",
    "wlac.elumenapp.com": "WLAC",
}

# Reverse mapping: abbreviation -> tenant domain
ABBREV_TENANT_MAP = {v: k for k, v in TENANT_ABBREV_MAP.items()}


class CourseStatus(str, Enum):
    """Course status filter options for the eLumen API."""
    APPROVED = "approved"
    ALL = "all"


class ProgramStatus(str, Enum):
    """Program status filter options for the eLumen API."""
    APPROVED_DEACTIVATED = "approved-deactivated"
    APPROVED = "approved"
    ALL = "all"


# Pydantic Models for API Responses


class TenantResponse(BaseModel):
    """Represents an LACCD college/campus from the API."""
    id: int
    name: str  # e.g., "elac.elumenapp.com"
    display_name: str = Field(alias="displayName")  # e.g., "ELAC"
    base_url: str = Field(alias="baseUrl")

    class Config:
        populate_by_name = True

    @property
    def abbreviation(self) -> str:
        """Get the college abbreviation."""
        return TENANT_ABBREV_MAP.get(self.name, self.display_name)


class CreditsAndHours(BaseModel):
    """Course credit and hours information."""
    credit: Optional[float] = None
    minimum_credit: Optional[float] = Field(None, alias="minimumCredit")
    maximum_credit: Optional[float] = Field(None, alias="maximumCredit")
    lecture_hours: Optional[float] = Field(None, alias="lectureHours")
    lab_hours: Optional[float] = Field(None, alias="labHours")
    activity_hours: Optional[float] = Field(None, alias="activityHours")
    tba_hours: Optional[float] = Field(None, alias="tbaHours")

    class Config:
        populate_by_name = True


class Objective(BaseModel):
    """Course objective."""
    sequence: Optional[int] = None
    name: Optional[str] = None  # eLumen uses 'name' for objective text
    description: Optional[str] = None

    @property
    def text(self) -> Optional[str]:
        """Get objective text (name or description)."""
        return self.name or self.description


class Outcome(BaseModel):
    """Student Learning Outcome (CSLO)."""
    sequence: Optional[int] = None
    name: Optional[str] = None  # eLumen uses 'name' for outcome text
    title: Optional[str] = None
    description: Optional[str] = None
    performance: Optional[str] = None  # Performance level (e.g., "70.00")
    outcome_level: Optional[str] = Field(None, alias="outcomeLevel")  # e.g., "CSLO"
    performance_criteria: list[str] = Field(default_factory=list, alias="performanceCriteria")

    class Config:
        populate_by_name = True

    @property
    def text(self) -> Optional[str]:
        """Get outcome text (name, title, or description)."""
        return self.name or self.title or self.description


class CustomField(BaseModel):
    """Custom field (including CB codes)."""
    custom_field_id: str = Field(alias="customFieldID")
    custom_field_value: list[str] = Field(default_factory=list, alias="customFieldValue")

    class Config:
        populate_by_name = True


class TaxonomyCode(BaseModel):
    """TOP code information."""
    code: Optional[str] = None
    title: Optional[str] = None


class RequisiteItem(BaseModel):
    """Individual prerequisite/corequisite/advisory item."""
    type: Optional[str] = None  # "prerequisite", "corequisite", "advisory"
    course_code: Optional[str] = Field(None, alias="courseCode")
    course_name: Optional[str] = Field(None, alias="courseName")
    description: Optional[str] = None
    non_course: Optional[bool] = Field(None, alias="nonCourse")

    class Config:
        populate_by_name = True


class Author(BaseModel):
    """Author/instructor information."""
    first_name: Optional[str] = Field(None, alias="firstName")
    last_name: Optional[str] = Field(None, alias="lastName")

    class Config:
        populate_by_name = True


class FullCourseInfo(BaseModel):
    """Parsed full course information from eLumen."""
    course_description: Optional[str] = Field(None, alias="courseDescription")
    credits_and_hours: list[CreditsAndHours] = Field(default_factory=list, alias="creditsAndHours")
    objectives: list[Objective] = Field(default_factory=list)
    outcomes: list[Outcome] = Field(default_factory=list)
    custom_fields: list[CustomField] = Field(default_factory=list, alias="customFields")
    system_taxonomy_code: Optional[TaxonomyCode] = Field(None, alias="systemTaxonomyCode")
    requisites: Optional[dict] = None
    authors: list[Author] = Field(default_factory=list)
    start_term: Optional[str] = Field(None, alias="startTerm")

    class Config:
        populate_by_name = True


class CourseResponse(BaseModel):
    """Represents a Course Outline of Record from the API."""
    id: int
    code: str  # e.g., "MATH 101"
    name: str  # Course title
    tenant: str  # College domain
    status: str
    creation_date: Optional[str] = Field(None, alias="creationDate")
    workflow_type: Optional[str] = Field(None, alias="workflowType")
    full_course_info: Optional[FullCourseInfo] = None  # Parsed from JSON string

    class Config:
        populate_by_name = True

    @property
    def college(self) -> str:
        """Get the college abbreviation from tenant."""
        return TENANT_ABBREV_MAP.get(self.tenant, self.tenant)

    @property
    def subject(self) -> str:
        """Extract subject code from course code."""
        parts = self.code.split()
        return parts[0] if parts else ""

    @property
    def number(self) -> str:
        """Extract course number from course code."""
        parts = self.code.split()
        return parts[1] if len(parts) > 1 else ""

    @property
    def units(self) -> Optional[float]:
        """Get course units from full_course_info."""
        if self.full_course_info and self.full_course_info.credits_and_hours:
            ch = self.full_course_info.credits_and_hours[0]
            return ch.credit or ch.maximum_credit
        return None

    @property
    def description(self) -> Optional[str]:
        """Get course description."""
        if self.full_course_info:
            return self.full_course_info.course_description
        return None

    @property
    def top_code(self) -> Optional[str]:
        """Get TOP code."""
        if self.full_course_info and self.full_course_info.system_taxonomy_code:
            return self.full_course_info.system_taxonomy_code.code
        return None

    @property
    def cb_codes(self) -> dict[str, Optional[str]]:
        """Extract all CB codes from custom fields."""
        cb_codes = {}
        if self.full_course_info:
            for field in self.full_course_info.custom_fields:
                if field.custom_field_id.startswith("CB"):
                    cb_codes[field.custom_field_id] = (
                        field.custom_field_value[0] if field.custom_field_value else None
                    )
        return cb_codes

    @property
    def authors(self) -> list[dict]:
        """Get authors list."""
        if self.full_course_info and self.full_course_info.authors:
            return [
                {"firstName": a.first_name, "lastName": a.last_name}
                for a in self.full_course_info.authors
            ]
        return []

    @property
    def start_term(self) -> Optional[str]:
        """Get start term."""
        if self.full_course_info:
            return self.full_course_info.start_term
        return None


class ProgramResponse(BaseModel):
    """Represents a degree or certificate program from the API."""
    id: int
    name: str
    tenant: str
    description: Optional[str] = None
    status: str
    top_code: Optional[str] = Field(None, alias="topCode")
    control_number: Optional[str] = Field(None, alias="controlNumber")
    curriculum_id: Optional[str] = Field(None, alias="curriculumId")
    start_term_name: Optional[str] = Field(None, alias="startTermName")

    class Config:
        populate_by_name = True

    @property
    def college(self) -> str:
        """Get the college abbreviation from tenant."""
        return TENANT_ABBREV_MAP.get(self.tenant, self.tenant)


class eLumenClient:
    """
    Async client for the eLumen public API.

    Usage:
        async with eLumenClient() as client:
            # Get all tenants (colleges)
            tenants = await client.get_tenants()

            # Get courses for a specific college
            courses = await client.get_courses(tenant="LAMC", limit=50)

            # Search courses
            math_courses = await client.get_courses(query="calculus")

            # Get a specific course
            course = await client.get_course_by_code("MATH", "261", tenant="LAMC")

            # Iterate over all courses
            async for course in client.iter_courses():
                print(course.code, course.name)

            # Get programs
            programs = await client.get_programs(tenant="ELAC")
    """

    def __init__(self, base_url: str = BASE_URL, timeout: float = REQUEST_TIMEOUT):
        self.base_url = base_url
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self) -> "eLumenClient":
        """Enter async context manager."""
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=self.timeout,
            headers={
                "authorization": "public-token",
                "Accept": "application/json",
            },
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """Exit async context manager."""
        if self._client:
            await self._client.aclose()
            self._client = None

    @property
    def client(self) -> httpx.AsyncClient:
        """Get the HTTP client, raising if not initialized."""
        if self._client is None:
            raise RuntimeError("Client not initialized. Use 'async with eLumenClient() as client:'")
        return self._client

    def _resolve_tenant(self, tenant: str) -> str:
        """
        Resolve tenant abbreviation to full domain if needed.

        Args:
            tenant: Either abbreviation (LAMC) or full domain (lamission.elumenapp.com)

        Returns:
            Full tenant domain for API query
        """
        if not tenant:
            return ""
        # If it's an abbreviation, convert to domain
        if tenant.upper() in ABBREV_TENANT_MAP:
            return ABBREV_TENANT_MAP[tenant.upper()]
        return tenant

    async def get_tenants(self) -> list[TenantResponse]:
        """Get list of all LACCD colleges."""
        response = await self.client.get("/public/tenants/")
        response.raise_for_status()
        return [TenantResponse(**t) for t in response.json()]

    async def _get_courses_page(
        self,
        page: int = 1,
        page_size: int = DEFAULT_PAGE_SIZE,
        tenant: str = "",
        query: str = "",
        status: CourseStatus = CourseStatus.APPROVED,
    ) -> list[CourseResponse]:
        """Fetch a single page of courses."""
        response = await self.client.get(
            "/public/courses",
            params={
                "status": status.value,
                "tenant": self._resolve_tenant(tenant),
                "query": query,
                "pageSize": page_size,
                "page": page,
            },
        )
        response.raise_for_status()
        data = response.json()

        courses_data = data.get("_embedded", {}).get("courses", [])

        courses = []
        for c in courses_data:
            # Parse fullCourseInfo JSON string
            full_info = None
            if c.get("fullCourseInfo"):
                try:
                    parsed = json.loads(c["fullCourseInfo"])
                    full_info = FullCourseInfo(**parsed)
                except (json.JSONDecodeError, Exception):
                    full_info = None

            course = CourseResponse(
                id=c["id"],
                code=c["code"],
                name=c["name"],
                tenant=c["tenant"],
                status=c["status"],
                creation_date=c.get("creationDate"),
                workflow_type=c.get("workflowType"),
                full_course_info=full_info,
            )
            courses.append(course)

        return courses

    async def iter_courses(
        self,
        tenant: str = "",
        query: str = "",
        status: CourseStatus = CourseStatus.APPROVED,
        page_size: int = DEFAULT_PAGE_SIZE,
        max_pages: Optional[int] = None,
    ) -> AsyncIterator[CourseResponse]:
        """
        Async iterate over all courses matching the criteria.

        Args:
            tenant: Filter by college abbreviation (e.g., "LAMC") or domain
            query: Search query string
            status: Course status filter (default: approved)
            page_size: Results per page
            max_pages: Maximum pages to fetch (None for all)

        Yields:
            CourseResponse objects
        """
        page = 1
        while True:
            if max_pages and page > max_pages:
                break

            courses = await self._get_courses_page(
                page=page,
                page_size=page_size,
                tenant=tenant,
                query=query,
                status=status,
            )

            if not courses:
                break

            for course in courses:
                yield course
            page += 1

    async def get_courses(
        self,
        tenant: str = "",
        query: str = "",
        status: CourseStatus = CourseStatus.APPROVED,
        limit: Optional[int] = None,
        page_size: int = DEFAULT_PAGE_SIZE,
    ) -> list[CourseResponse]:
        """
        Get all courses matching the criteria.

        Args:
            tenant: Filter by college abbreviation (e.g., "LAMC") or domain
            query: Search query string
            status: Course status filter
            limit: Maximum number of courses to return
            page_size: Results per page

        Returns:
            List of CourseResponse objects
        """
        courses = []
        async for course in self.iter_courses(
            tenant=tenant, query=query, status=status, page_size=page_size
        ):
            courses.append(course)
            if limit and len(courses) >= limit:
                break
        return courses

    async def get_course_by_code(
        self,
        subject: str,
        number: str,
        tenant: str = "",
    ) -> Optional[CourseResponse]:
        """
        Find a specific course by subject and number.

        Args:
            subject: Subject code (e.g., "MATH")
            number: Course number (e.g., "101" or "261")
            tenant: Optional college filter (e.g., "LAMC")

        Returns:
            CourseResponse or None if not found
        """
        # Try searching with subject+number
        search_terms = [
            f"{subject}{number}",
            f"{subject} {number}",
        ]

        for search in search_terms:
            async for course in self.iter_courses(
                query=search, tenant=tenant, max_pages=3
            ):
                # Normalize for comparison
                course_code_normalized = course.code.replace(" ", "").upper()
                search_normalized = f"{subject}{number}".upper()

                if course_code_normalized == search_normalized:
                    return course

                # Also check subject and number independently
                if (
                    course.subject.upper() == subject.upper()
                    and course.number == number
                ):
                    return course

        return None

    async def _get_programs_page(
        self,
        page: int = 1,
        page_size: int = DEFAULT_PAGE_SIZE,
        tenant: str = "",
        query: str = "",
        status: ProgramStatus = ProgramStatus.APPROVED_DEACTIVATED,
    ) -> list[ProgramResponse]:
        """Fetch a single page of programs."""
        response = await self.client.get(
            "/public/programs",
            params={
                "status": status.value,
                "tenant": self._resolve_tenant(tenant),
                "query": query,
                "pageSize": page_size,
                "page": page,
            },
        )
        response.raise_for_status()
        data = response.json()

        programs_data = data.get("_embedded", {}).get("programs", [])
        return [ProgramResponse(**p) for p in programs_data]

    async def iter_programs(
        self,
        tenant: str = "",
        query: str = "",
        status: ProgramStatus = ProgramStatus.APPROVED_DEACTIVATED,
        page_size: int = DEFAULT_PAGE_SIZE,
        max_pages: Optional[int] = None,
    ) -> AsyncIterator[ProgramResponse]:
        """
        Async iterate over all programs matching the criteria.

        Args:
            tenant: Filter by college abbreviation or domain
            query: Search query string
            status: Program status filter
            page_size: Results per page
            max_pages: Maximum pages to fetch

        Yields:
            ProgramResponse objects
        """
        page = 1
        while True:
            if max_pages and page > max_pages:
                break

            programs = await self._get_programs_page(
                page=page,
                page_size=page_size,
                tenant=tenant,
                query=query,
                status=status,
            )

            if not programs:
                break

            for program in programs:
                yield program
            page += 1

    async def get_programs(
        self,
        tenant: str = "",
        query: str = "",
        status: ProgramStatus = ProgramStatus.APPROVED_DEACTIVATED,
        limit: Optional[int] = None,
        page_size: int = DEFAULT_PAGE_SIZE,
    ) -> list[ProgramResponse]:
        """
        Get all programs matching the criteria.

        Args:
            tenant: Filter by college abbreviation or domain
            query: Search query string
            status: Program status filter
            limit: Maximum number of programs to return
            page_size: Results per page

        Returns:
            List of ProgramResponse objects
        """
        programs = []
        async for program in self.iter_programs(
            tenant=tenant, query=query, status=status, page_size=page_size
        ):
            programs.append(program)
            if limit and len(programs) >= limit:
                break
        return programs


# Synchronous wrapper for use in seed scripts and CLI


class SynceLumenClient:
    """
    Synchronous wrapper for eLumen client.

    Usage:
        client = SynceLumenClient()
        tenants = client.get_tenants()
        courses = client.get_courses(tenant="LAMC", limit=50)
    """

    def __init__(self, base_url: str = BASE_URL, timeout: float = REQUEST_TIMEOUT):
        self.base_url = base_url
        self.timeout = timeout
        self._client = httpx.Client(
            base_url=base_url,
            timeout=timeout,
            headers={
                "authorization": "public-token",
                "Accept": "application/json",
            },
        )

    def __enter__(self) -> "SynceLumenClient":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self._client.close()

    def close(self) -> None:
        """Close the HTTP client."""
        self._client.close()

    def _resolve_tenant(self, tenant: str) -> str:
        """Resolve tenant abbreviation to full domain if needed."""
        if not tenant:
            return ""
        if tenant.upper() in ABBREV_TENANT_MAP:
            return ABBREV_TENANT_MAP[tenant.upper()]
        return tenant

    def get_tenants(self) -> list[TenantResponse]:
        """Get list of all LACCD colleges."""
        response = self._client.get("/public/tenants/")
        response.raise_for_status()
        return [TenantResponse(**t) for t in response.json()]

    def get_courses(
        self,
        tenant: str = "",
        query: str = "",
        status: CourseStatus = CourseStatus.APPROVED,
        limit: Optional[int] = None,
        page_size: int = DEFAULT_PAGE_SIZE,
    ) -> list[CourseResponse]:
        """Get courses matching the criteria."""
        courses = []
        page = 1

        while True:
            response = self._client.get(
                "/public/courses",
                params={
                    "status": status.value,
                    "tenant": self._resolve_tenant(tenant),
                    "query": query,
                    "pageSize": page_size,
                    "page": page,
                },
            )
            response.raise_for_status()
            data = response.json()

            courses_data = data.get("_embedded", {}).get("courses", [])
            if not courses_data:
                break

            for c in courses_data:
                full_info = None
                if c.get("fullCourseInfo"):
                    try:
                        parsed = json.loads(c["fullCourseInfo"])
                        full_info = FullCourseInfo(**parsed)
                    except (json.JSONDecodeError, Exception):
                        full_info = None

                course = CourseResponse(
                    id=c["id"],
                    code=c["code"],
                    name=c["name"],
                    tenant=c["tenant"],
                    status=c["status"],
                    creation_date=c.get("creationDate"),
                    workflow_type=c.get("workflowType"),
                    full_course_info=full_info,
                )
                courses.append(course)

                if limit and len(courses) >= limit:
                    return courses

            page += 1

        return courses

    def get_course_by_code(
        self,
        subject: str,
        number: str,
        tenant: str = "",
    ) -> Optional[CourseResponse]:
        """Find a specific course by subject and number."""
        search = f"{subject} {number}"
        courses = self.get_courses(query=search, tenant=tenant, limit=20)

        for course in courses:
            course_code_normalized = course.code.replace(" ", "").upper()
            search_normalized = f"{subject}{number}".upper()

            if course_code_normalized == search_normalized:
                return course

            if course.subject.upper() == subject.upper() and course.number == number:
                return course

        return None

    def get_programs(
        self,
        tenant: str = "",
        query: str = "",
        status: ProgramStatus = ProgramStatus.APPROVED_DEACTIVATED,
        limit: Optional[int] = None,
        page_size: int = DEFAULT_PAGE_SIZE,
    ) -> list[ProgramResponse]:
        """Get programs matching the criteria."""
        programs = []
        page = 1

        while True:
            response = self._client.get(
                "/public/programs",
                params={
                    "status": status.value,
                    "tenant": self._resolve_tenant(tenant),
                    "query": query,
                    "pageSize": page_size,
                    "page": page,
                },
            )
            response.raise_for_status()
            data = response.json()

            programs_data = data.get("_embedded", {}).get("programs", [])
            if not programs_data:
                break

            for p in programs_data:
                programs.append(ProgramResponse(**p))
                if limit and len(programs) >= limit:
                    return programs

            page += 1

        return programs


# Convenience functions


def get_elumen_client() -> SynceLumenClient:
    """Get a synchronous eLumen client instance."""
    return SynceLumenClient()


async def get_async_elumen_client() -> eLumenClient:
    """Get an async eLumen client (must use as context manager)."""
    return eLumenClient()
