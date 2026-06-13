"""
Reference Data API Routes

Provides endpoints for CCN/C-ID standards, TOP codes, and other reference data.
These endpoints are public (no authentication required) as they serve reference data.
"""

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.core.database import get_session
from app.models.reference import (
    CCNStandard,
    CCNStandardRead,
    TOPCode,
    TOPCodeRead,
)

router = APIRouter()


# =============================================================================
# CCN Standards Endpoints
# =============================================================================

@router.get("/ccn-standards", response_model=List[CCNStandardRead])
async def list_ccn_standards(
    discipline: Optional[str] = Query(None, description="Filter by discipline (e.g., MATH, ENGL)"),
    search: Optional[str] = Query(None, description="Search by C-ID or title"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    session: Session = Depends(get_session),
) -> List[CCNStandardRead]:
    """
    List CCN/C-ID standards with optional filtering.

    Returns Common Course Numbering standards from the California Community
    Colleges system, used for AB 1111 course alignment.
    """
    query = select(CCNStandard)

    # Filter by discipline
    if discipline:
        query = query.where(CCNStandard.discipline == discipline.upper())

    # Search by C-ID or title
    if search:
        search_term = f"%{search}%"
        query = query.where(
            (CCNStandard.c_id.ilike(search_term)) |
            (CCNStandard.title.ilike(search_term))
        )

    # Order by discipline and C-ID
    query = query.order_by(CCNStandard.discipline, CCNStandard.c_id)

    # Pagination
    query = query.offset(skip).limit(limit)

    standards = session.exec(query).all()

    return [
        CCNStandardRead(
            id=std.id,
            c_id=std.c_id,
            discipline=std.discipline,
            title=std.title,
            descriptor=std.descriptor,
            minimum_units=std.minimum_units,
            subject_code=std.subject_code,
            course_number=std.course_number,
            prerequisites=std.prerequisites,
            corequisites=std.corequisites,
            evaluation_methods=std.evaluation_methods,
            is_honors=std.is_honors,
            is_lab_only=std.is_lab_only,
            is_support_course=std.is_support_course,
            has_embedded_support=std.has_embedded_support,
            implied_cb05=std.implied_cb05,
            implied_top_code=std.implied_top_code,
            source_file=std.source_file,
            approved_date=std.approved_date,
            slo_requirements=std.slo_requirements or [],
            content_requirements=std.content_requirements or [],
            objectives=std.objectives or [],
            representative_texts=std.representative_texts or [],
            created_at=std.created_at,
            updated_at=std.updated_at,
        )
        for std in standards
    ]


@router.get("/ccn-standards/{standard_id}", response_model=CCNStandardRead)
async def get_ccn_standard(
    standard_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> CCNStandardRead:
    """
    Get a specific CCN standard by ID.

    Returns full details including SLO and content requirements.
    """
    standard = session.get(CCNStandard, standard_id)

    if not standard:
        raise HTTPException(status_code=404, detail="CCN standard not found")

    return CCNStandardRead(
        id=standard.id,
        c_id=standard.c_id,
        discipline=standard.discipline,
        title=standard.title,
        descriptor=standard.descriptor,
        minimum_units=standard.minimum_units,
        subject_code=standard.subject_code,
        course_number=standard.course_number,
        prerequisites=standard.prerequisites,
        corequisites=standard.corequisites,
        evaluation_methods=standard.evaluation_methods,
        is_honors=standard.is_honors,
        is_lab_only=standard.is_lab_only,
        is_support_course=standard.is_support_course,
        has_embedded_support=standard.has_embedded_support,
        implied_cb05=standard.implied_cb05,
        implied_top_code=standard.implied_top_code,
        source_file=standard.source_file,
        approved_date=standard.approved_date,
        slo_requirements=standard.slo_requirements or [],
        content_requirements=standard.content_requirements or [],
        objectives=standard.objectives or [],
        representative_texts=standard.representative_texts or [],
        created_at=standard.created_at,
        updated_at=standard.updated_at,
    )


@router.get("/ccn-standards/by-cid/{c_id}", response_model=CCNStandardRead)
async def get_ccn_standard_by_cid(
    c_id: str,
    session: Session = Depends(get_session),
) -> CCNStandardRead:
    """
    Get a CCN standard by its C-ID number (e.g., "MATH C1051").
    """
    query = select(CCNStandard).where(CCNStandard.c_id == c_id.upper())
    standard = session.exec(query).first()

    if not standard:
        raise HTTPException(status_code=404, detail=f"CCN standard {c_id} not found")

    return CCNStandardRead(
        id=standard.id,
        c_id=standard.c_id,
        discipline=standard.discipline,
        title=standard.title,
        descriptor=standard.descriptor,
        minimum_units=standard.minimum_units,
        subject_code=standard.subject_code,
        course_number=standard.course_number,
        prerequisites=standard.prerequisites,
        corequisites=standard.corequisites,
        evaluation_methods=standard.evaluation_methods,
        is_honors=standard.is_honors,
        is_lab_only=standard.is_lab_only,
        is_support_course=standard.is_support_course,
        has_embedded_support=standard.has_embedded_support,
        implied_cb05=standard.implied_cb05,
        implied_top_code=standard.implied_top_code,
        source_file=standard.source_file,
        approved_date=standard.approved_date,
        slo_requirements=standard.slo_requirements or [],
        content_requirements=standard.content_requirements or [],
        objectives=standard.objectives or [],
        representative_texts=standard.representative_texts or [],
        created_at=standard.created_at,
        updated_at=standard.updated_at,
    )


@router.get("/ccn-standards/match/{subject_code}", response_model=List[CCNStandardRead])
async def find_matching_ccn_standards(
    subject_code: str,
    title: Optional[str] = Query(None, description="Course title to match"),
    session: Session = Depends(get_session),
) -> List[CCNStandardRead]:
    """
    Find CCN standards that might match a course based on subject code and title.

    This endpoint helps with automatic C-ID alignment detection.
    Returns potential matches sorted by relevance.
    """
    # Map common subject codes to CCN disciplines
    discipline_map = {
        "MATH": "MATH",
        "ENGL": "ENGL",
        "ENG": "ENGL",
        "PSYCH": "PSYC",
        "PSY": "PSYC",
        "PSYC": "PSYC",
        "SOC": "SOCI",
        "SOCI": "SOCI",
        "SOCIO": "SOCI",
        "BIOL": "BIOL",
        "BIO": "BIOL",
        "HIST": "HIST",
        "CHEM": "CHEM",
        "PHYS": "PHYS",
        "ECON": "ECON",
        "POLI": "POLS",
        "POLS": "POLS",
        "SPAN": "SPAN",
        "FREN": "FREN",
        "PHIL": "PHIL",
        "ART": "ARTS",
        "ARTS": "ARTS",
        "MUS": "MUSI",
        "MUSI": "MUSI",
        "COMM": "COMM",
        "SPCH": "COMM",
        "CS": "COMP",
        "CIS": "COMP",
        "COMP": "COMP",
    }

    # Get the CCN discipline for this subject
    ccn_discipline = discipline_map.get(subject_code.upper(), subject_code.upper())

    query = select(CCNStandard).where(CCNStandard.discipline == ccn_discipline)

    # If title is provided, try to match it
    if title:
        # Boost title matches
        title_lower = title.lower()
        query = query.order_by(
            CCNStandard.title.ilike(f"%{title_lower}%").desc(),
            CCNStandard.c_id
        )
    else:
        query = query.order_by(CCNStandard.c_id)

    query = query.limit(10)

    standards = session.exec(query).all()

    return [
        CCNStandardRead(
            id=std.id,
            c_id=std.c_id,
            discipline=std.discipline,
            title=std.title,
            descriptor=std.descriptor,
            minimum_units=std.minimum_units,
            subject_code=std.subject_code,
            course_number=std.course_number,
            prerequisites=std.prerequisites,
            corequisites=std.corequisites,
            evaluation_methods=std.evaluation_methods,
            is_honors=std.is_honors,
            is_lab_only=std.is_lab_only,
            is_support_course=std.is_support_course,
            has_embedded_support=std.has_embedded_support,
            implied_cb05=std.implied_cb05,
            implied_top_code=std.implied_top_code,
            source_file=std.source_file,
            approved_date=std.approved_date,
            slo_requirements=std.slo_requirements or [],
            content_requirements=std.content_requirements or [],
            objectives=std.objectives or [],
            representative_texts=std.representative_texts or [],
            created_at=std.created_at,
            updated_at=std.updated_at,
        )
        for std in standards
    ]


# =============================================================================
# TOP Codes Endpoints
# =============================================================================

@router.get("/top-codes", response_model=List[TOPCodeRead])
async def list_top_codes(
    search: Optional[str] = Query(None, description="Search by code or title"),
    vocational_only: Optional[bool] = Query(None, description="Filter to vocational programs only"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=250),
    session: Session = Depends(get_session),
) -> List[TOPCodeRead]:
    """
    List TOP codes with optional filtering.

    Returns Taxonomy of Programs codes used for CB03 state reporting.
    """
    query = select(TOPCode)

    # Filter by vocational status
    if vocational_only is not None:
        query = query.where(TOPCode.is_vocational == vocational_only)

    # Search by code or title
    if search:
        search_term = f"%{search}%"
        query = query.where(
            (TOPCode.code.ilike(search_term)) |
            (TOPCode.title.ilike(search_term))
        )

    # Order by code
    query = query.order_by(TOPCode.code)

    # Pagination
    query = query.offset(skip).limit(limit)

    codes = session.exec(query).all()

    return [
        TOPCodeRead(
            id=code.id,
            code=code.code,
            title=code.title,
            is_vocational=code.is_vocational,
            parent_code=code.parent_code,
            created_at=code.created_at,
        )
        for code in codes
    ]


@router.get("/top-codes/{code}", response_model=TOPCodeRead)
async def get_top_code(
    code: str,
    session: Session = Depends(get_session),
) -> TOPCodeRead:
    """
    Get a specific TOP code by its code number (e.g., "1701.00").
    """
    query = select(TOPCode).where(TOPCode.code == code)
    top_code = session.exec(query).first()

    if not top_code:
        raise HTTPException(status_code=404, detail=f"TOP code {code} not found")

    return TOPCodeRead(
        id=top_code.id,
        code=top_code.code,
        title=top_code.title,
        is_vocational=top_code.is_vocational,
        parent_code=top_code.parent_code,
        created_at=top_code.created_at,
    )


# =============================================================================
# Disciplines List
# =============================================================================

@router.get("/disciplines")
async def list_disciplines(
    session: Session = Depends(get_session),
) -> List[str]:
    """
    Get a list of unique CCN disciplines.

    Useful for populating discipline filter dropdowns.
    """
    query = select(CCNStandard.discipline).distinct().order_by(CCNStandard.discipline)
    disciplines = session.exec(query).all()
    return list(disciplines)


# =============================================================================
# GE Patterns Endpoints
# =============================================================================

# Cal-GETC (California General Education Transfer Curriculum) Areas
# Replaces IGETC and CSU-GE Breadth starting Fall 2025
CAL_GETC_AREAS = [
    {
        "code": "1",
        "name": "English Communication",
        "description": "Courses in English reading and written composition at the college level.",
        "subareas": [
            {"code": "1A", "name": "English Composition", "units_required": 3},
            {"code": "1B", "name": "Critical Thinking and Composition", "units_required": 3},
            {"code": "1C", "name": "Oral Communication", "units_required": 3},
        ],
        "total_units_required": 9,
    },
    {
        "code": "2",
        "name": "Mathematical Concepts and Quantitative Reasoning",
        "description": "Courses in mathematics or statistics that have an intermediate algebra prerequisite.",
        "subareas": [],
        "total_units_required": 3,
    },
    {
        "code": "3",
        "name": "Arts and Humanities",
        "description": "Courses that examine human cultures and the human condition through the arts, literature, philosophy, and languages.",
        "subareas": [
            {"code": "3A", "name": "Arts (Art, Cinema, Dance, Music, Theater)", "units_required": 3},
            {"code": "3B", "name": "Humanities (Literature, Philosophy, Languages)", "units_required": 3},
        ],
        "total_units_required": 9,
        "notes": "At least one course from each subarea required.",
    },
    {
        "code": "4",
        "name": "Social and Behavioral Sciences",
        "description": "Courses that examine human behavior and social institutions using scientific methods.",
        "subareas": [],
        "total_units_required": 9,
        "notes": "Courses from at least 2 disciplines required.",
    },
    {
        "code": "5",
        "name": "Physical and Biological Sciences",
        "description": "Courses in the natural sciences that include laboratory experience.",
        "subareas": [
            {"code": "5A", "name": "Physical Sciences", "units_required": 3},
            {"code": "5B", "name": "Biological Sciences", "units_required": 3},
            {"code": "5C", "name": "Laboratory Activity", "units_required": 0},
        ],
        "total_units_required": 7,
        "notes": "At least one course from 5A and one from 5B. At least one lab course (5C).",
    },
    {
        "code": "6",
        "name": "Ethnic Studies",
        "description": "Courses focusing on Native Americans, African Americans, Asian Americans, and Latina/Latino Americans.",
        "subareas": [],
        "total_units_required": 3,
    },
]

# LAMC Local GE Pattern
LAMC_LOCAL_GE_AREAS = [
    {
        "code": "A",
        "name": "Natural Sciences",
        "description": "Courses in biological and physical sciences.",
        "units_required": 3,
    },
    {
        "code": "B",
        "name": "Social and Behavioral Sciences",
        "description": "Courses examining human behavior and social institutions.",
        "units_required": 3,
    },
    {
        "code": "C",
        "name": "Humanities",
        "description": "Courses in arts, literature, philosophy, and foreign languages.",
        "units_required": 3,
    },
    {
        "code": "D",
        "name": "Language and Rationality",
        "description": "Courses in English composition, communication, and mathematics.",
        "subareas": [
            {"code": "D1", "name": "English Composition", "units_required": 3},
            {"code": "D2", "name": "Communication and Analytical Thinking", "units_required": 3},
        ],
        "units_required": 6,
    },
    {
        "code": "E",
        "name": "Health and Physical Education",
        "description": "Courses promoting physical health and wellness.",
        "units_required": 2,
    },
    {
        "code": "F",
        "name": "Ethnic Studies",
        "description": "Courses focusing on the experiences and contributions of ethnic groups.",
        "units_required": 3,
    },
]


@router.get("/ge-patterns")
async def list_ge_patterns(
    pattern: Optional[str] = Query(None, description="Filter by pattern type: 'cal-getc' or 'local'"),
) -> dict:
    """
    Get General Education patterns for course GE applicability.

    Returns both Cal-GETC (California General Education Transfer Curriculum)
    and local LAMC GE patterns for use in course editor GE selection.

    Cal-GETC replaces IGETC and CSU-GE Breadth starting Fall 2025 under AB 928.
    """
    result = {
        "cal_getc": {
            "name": "Cal-GETC (California General Education Transfer Curriculum)",
            "description": "Single lower-division GE pathway for transfer to CSU and UC. Replaces IGETC and CSU-GE Breadth per AB 928.",
            "effective_date": "Fall 2025",
            "total_units": "34 semester units minimum",
            "areas": CAL_GETC_AREAS,
        },
        "local": {
            "name": "LAMC Local GE Pattern",
            "description": "General Education requirements for Associate degrees not intended for transfer.",
            "total_units": "21 semester units minimum",
            "areas": LAMC_LOCAL_GE_AREAS,
        },
    }

    # Filter by pattern type if specified
    if pattern:
        pattern_lower = pattern.lower().replace("-", "_")
        if pattern_lower == "cal_getc" or pattern_lower == "calgetc":
            return {"cal_getc": result["cal_getc"]}
        elif pattern_lower == "local":
            return {"local": result["local"]}

    return result


@router.get("/ge-patterns/areas")
async def list_ge_areas(
    pattern: str = Query("cal-getc", description="Pattern type: 'cal-getc' or 'local'"),
) -> List[dict]:
    """
    Get a flat list of GE areas for dropdown selection.

    Returns simplified area codes and names for use in course editor
    ge_applicability field selection.
    """
    if pattern.lower().replace("-", "_") in ["cal_getc", "calgetc", "cal-getc"]:
        areas = []
        for area in CAL_GETC_AREAS:
            # Add main area
            areas.append({
                "code": f"Cal-GETC {area['code']}",
                "name": f"Area {area['code']}: {area['name']}",
                "pattern": "Cal-GETC",
            })
            # Add subareas if any
            for subarea in area.get("subareas", []):
                areas.append({
                    "code": f"Cal-GETC {subarea['code']}",
                    "name": f"Area {subarea['code']}: {subarea['name']}",
                    "pattern": "Cal-GETC",
                })
        return areas
    else:
        areas = []
        for area in LAMC_LOCAL_GE_AREAS:
            areas.append({
                "code": f"Local {area['code']}",
                "name": f"Area {area['code']}: {area['name']}",
                "pattern": "Local",
            })
            # Add subareas if any
            for subarea in area.get("subareas", []):
                areas.append({
                    "code": f"Local {subarea['code']}",
                    "name": f"Area {subarea['code']}: {subarea['name']}",
                    "pattern": "Local",
                })
        return areas


# =============================================================================
# Bloom's Taxonomy Verbs Endpoints
# =============================================================================

# Bloom's Taxonomy Cognitive Domain Levels (Revised, 2001)
# Used for writing measurable Student Learning Outcomes (SLOs)
BLOOMS_LEVELS = [
    {
        "level": 1,
        "name": "Remember",
        "description": "Recall facts and basic concepts",
        "color": {
            "bg": "bg-red-100",
            "text": "text-red-700",
            "border": "border-red-300",
            "dark_bg": "dark:bg-red-900/30",
            "dark_text": "dark:text-red-300",
        },
        "verbs": [
            "define", "describe", "identify", "label", "list", "match", "name",
            "outline", "recall", "recognize", "reproduce", "select", "state",
            "memorize", "repeat", "record", "relate", "retrieve"
        ],
    },
    {
        "level": 2,
        "name": "Understand",
        "description": "Explain ideas or concepts",
        "color": {
            "bg": "bg-orange-100",
            "text": "text-orange-700",
            "border": "border-orange-300",
            "dark_bg": "dark:bg-orange-900/30",
            "dark_text": "dark:text-orange-300",
        },
        "verbs": [
            "classify", "compare", "contrast", "demonstrate", "explain",
            "illustrate", "interpret", "paraphrase", "predict", "summarize",
            "discuss", "distinguish", "estimate", "extend", "generalize",
            "give examples", "infer", "restate", "translate"
        ],
    },
    {
        "level": 3,
        "name": "Apply",
        "description": "Use information in new situations",
        "color": {
            "bg": "bg-yellow-100",
            "text": "text-yellow-700",
            "border": "border-yellow-300",
            "dark_bg": "dark:bg-yellow-900/30",
            "dark_text": "dark:text-yellow-300",
        },
        "verbs": [
            "apply", "calculate", "carry out", "complete", "compute",
            "demonstrate", "dramatize", "employ", "examine", "execute",
            "implement", "interpret", "modify", "operate", "practice",
            "prepare", "produce", "relate", "schedule", "show", "sketch",
            "solve", "use", "utilize"
        ],
    },
    {
        "level": 4,
        "name": "Analyze",
        "description": "Draw connections among ideas",
        "color": {
            "bg": "bg-green-100",
            "text": "text-green-700",
            "border": "border-green-300",
            "dark_bg": "dark:bg-green-900/30",
            "dark_text": "dark:text-green-300",
        },
        "verbs": [
            "analyze", "attribute", "break down", "categorize", "compare",
            "contrast", "deconstruct", "determine", "diagram", "differentiate",
            "discriminate", "distinguish", "examine", "experiment", "identify",
            "infer", "inspect", "investigate", "organize", "outline",
            "question", "relate", "separate", "test"
        ],
    },
    {
        "level": 5,
        "name": "Evaluate",
        "description": "Justify a stand or decision",
        "color": {
            "bg": "bg-blue-100",
            "text": "text-blue-700",
            "border": "border-blue-300",
            "dark_bg": "dark:bg-blue-900/30",
            "dark_text": "dark:text-blue-300",
        },
        "verbs": [
            "appraise", "argue", "assess", "check", "conclude", "convince",
            "critique", "debate", "decide", "defend", "detect", "discriminate",
            "evaluate", "judge", "justify", "measure", "monitor", "prioritize",
            "rank", "rate", "recommend", "review", "score", "select",
            "support", "test", "validate", "verify"
        ],
    },
    {
        "level": 6,
        "name": "Create",
        "description": "Produce new or original work",
        "color": {
            "bg": "bg-purple-100",
            "text": "text-purple-700",
            "border": "border-purple-300",
            "dark_bg": "dark:bg-purple-900/30",
            "dark_text": "dark:text-purple-300",
        },
        "verbs": [
            "arrange", "assemble", "build", "collect", "combine", "compile",
            "compose", "construct", "create", "design", "develop", "devise",
            "formulate", "generate", "hypothesize", "integrate", "invent",
            "modify", "organize", "plan", "prepare", "produce", "propose",
            "rearrange", "reconstruct", "revise", "rewrite", "set up",
            "synthesize", "write"
        ],
    },
]

# Weak verbs to avoid in SLOs - these are vague and not measurable
WEAK_VERBS = [
    "understand",
    "know",
    "learn",
    "appreciate",
    "become familiar with",
    "be aware of",
    "comprehend",
    "grasp",
    "realize",
    "be exposed to",
    "gain knowledge of",
    "be introduced to",
]


@router.get("/bloom-verbs")
async def list_bloom_verbs(
    level: Optional[int] = Query(None, ge=1, le=6, description="Filter by Bloom's level (1-6)"),
) -> dict:
    """
    Get Bloom's Taxonomy verbs for writing Student Learning Outcomes.

    Returns all 6 cognitive levels with their associated action verbs.
    Use the optional level parameter to filter to a specific level.

    Bloom's Taxonomy Levels:
    - Level 1 (Remember): Recall facts and basic concepts
    - Level 2 (Understand): Explain ideas or concepts
    - Level 3 (Apply): Use information in new situations
    - Level 4 (Analyze): Draw connections among ideas
    - Level 5 (Evaluate): Justify a stand or decision
    - Level 6 (Create): Produce new or original work
    """
    if level:
        # Return single level
        bloom_level = next((l for l in BLOOMS_LEVELS if l["level"] == level), None)
        if not bloom_level:
            raise HTTPException(status_code=404, detail=f"Bloom's level {level} not found")
        return {
            "levels": [bloom_level],
            "weak_verbs": WEAK_VERBS,
        }

    return {
        "levels": BLOOMS_LEVELS,
        "weak_verbs": WEAK_VERBS,
    }


@router.get("/bloom-verbs/weak")
async def list_weak_verbs() -> dict:
    """
    Get list of weak verbs to avoid in Student Learning Outcomes.

    These verbs are vague, not measurable, and should be replaced with
    stronger action verbs from Bloom's Taxonomy.
    """
    return {
        "weak_verbs": WEAK_VERBS,
        "recommendation": "Replace these verbs with measurable action verbs from Bloom's Taxonomy levels.",
    }


@router.get("/bloom-verbs/search")
async def search_bloom_verbs(
    verb: str = Query(..., min_length=2, description="Verb to search for"),
) -> dict:
    """
    Search for a verb across all Bloom's Taxonomy levels.

    Returns the level(s) where the verb appears, or flags it as a weak verb.
    Useful for validating SLO verb choices.
    """
    verb_lower = verb.lower().strip()

    # Check if it's a weak verb
    is_weak = verb_lower in [v.lower() for v in WEAK_VERBS]

    # Find matching levels
    matching_levels = []
    for bloom_level in BLOOMS_LEVELS:
        if verb_lower in [v.lower() for v in bloom_level["verbs"]]:
            matching_levels.append({
                "level": bloom_level["level"],
                "name": bloom_level["name"],
                "description": bloom_level["description"],
            })

    return {
        "verb": verb,
        "is_weak": is_weak,
        "matching_levels": matching_levels,
        "found": len(matching_levels) > 0,
        "recommendation": (
            "This is a weak verb. Consider using a stronger action verb from Bloom's Taxonomy."
            if is_weak else
            f"Found in {len(matching_levels)} level(s)." if matching_levels else
            "Verb not found in standard Bloom's Taxonomy lists. Verify it's measurable and appropriate."
        ),
    }
