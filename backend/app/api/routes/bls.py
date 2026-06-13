"""
BLS (Bureau of Labor Statistics) API Routes
============================================

Endpoints for accessing U.S. Bureau of Labor Statistics data including:
- Occupational Employment and Wage Statistics (OES)
- Unemployment rates (LAUS)
- Consumer Price Index (CPI)
- Custom series queries
"""

from typing import List, Optional, Dict
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel, Field

from app.services.bls_client import (
    BLSClient,
    BLSSeriesData,
    UnemploymentData,
    CPIData,
    OESWageData,
    COMMON_OCCUPATIONS,
    OES_AREAS,
)
from app.services.soc_occupations import (
    SOCOccupation,
    search_occupations,
    get_occupation_by_code,
    get_major_groups,
    MAJOR_GROUPS,
)
from app.services.occupation_projections import (
    OccupationProjection,
    get_projection,
    search_projections,
    get_available_soc_codes,
    EDUCATION_LEVELS,
    EXPERIENCE_LEVELS,
    TRAINING_LEVELS,
)

router = APIRouter()


# Response Models
class UnemploymentResponse(BaseModel):
    """Response for unemployment rate data."""
    data: List[UnemploymentData]
    areas: List[str]


class CPIResponse(BaseModel):
    """Response for CPI data."""
    data: List[CPIData]
    areas: List[str]


class SeriesResponse(BaseModel):
    """Response for custom series data."""
    series: List[BLSSeriesData]


class PopularSeriesResponse(BaseModel):
    """Response for popular series list."""
    series_ids: List[str]


class OccupationInfo(BaseModel):
    """Occupation information."""
    key: str
    code: str
    name: str


class AreaInfo(BaseModel):
    """Area information."""
    key: str
    code: str
    name: str


class OESResponse(BaseModel):
    """Response for OES wage data."""
    data: List[OESWageData]
    occupation: str
    areas: List[str]


class OESOptionsResponse(BaseModel):
    """Response for available OES options."""
    occupations: List[OccupationInfo]
    areas: List[AreaInfo]


class OccupationSearchResult(BaseModel):
    """Search result for an occupation."""
    code: str
    title: str
    major_group: str
    major_group_title: str


class OccupationSearchResponse(BaseModel):
    """Response for occupation search."""
    results: List[OccupationSearchResult]
    query: str
    total: int


class MajorGroupInfo(BaseModel):
    """Major occupation group information."""
    code: str
    title: str


class MajorGroupsResponse(BaseModel):
    """Response for major occupation groups."""
    groups: List[MajorGroupInfo]


@router.get("/oes/options", response_model=OESOptionsResponse)
async def get_oes_options():
    """
    Get available occupations and areas for OES queries.

    Returns lists of common occupations (with SOC codes) and available geographic areas.
    """
    occupations = [
        OccupationInfo(key=key, code=info["code"], name=info["name"])
        for key, info in COMMON_OCCUPATIONS.items()
    ]
    areas = [
        AreaInfo(key=key, code=info["code"], name=info["name"])
        for key, info in OES_AREAS.items()
    ]
    return OESOptionsResponse(occupations=occupations, areas=areas)


@router.get("/occupations/search", response_model=OccupationSearchResponse)
async def search_occupations_endpoint(
    q: str = Query(
        ...,
        min_length=2,
        description="Search query (min 2 characters). Matches occupation title or SOC code."
    ),
    limit: int = Query(
        default=20,
        ge=1,
        le=50,
        description="Maximum results to return (1-50)"
    ),
):
    """
    Search all SOC occupations by title or code.

    Returns matching occupations from the full BLS Standard Occupational Classification system.
    Useful for autocomplete/typeahead functionality.

    Examples:
    - Search by title: "nurse", "software", "electric"
    - Search by SOC code: "29-1141", "151252"
    """
    results = search_occupations(q, limit=limit)
    return OccupationSearchResponse(
        results=[
            OccupationSearchResult(
                code=occ.code,
                title=occ.title,
                major_group=occ.major_group,
                major_group_title=occ.major_group_title,
            )
            for occ in results
        ],
        query=q,
        total=len(results),
    )


@router.get("/occupations/groups", response_model=MajorGroupsResponse)
async def get_occupation_groups():
    """
    Get all major occupation groups (2-digit SOC codes).

    Returns the 22 major occupation groups used in the SOC system.
    Useful for filtering or browsing occupations by category.
    """
    groups = [
        MajorGroupInfo(code=code, title=title)
        for code, title in MAJOR_GROUPS.items()
    ]
    return MajorGroupsResponse(groups=sorted(groups, key=lambda x: x.code))


@router.get("/oes", response_model=OESResponse)
async def get_oes_wages(
    occupation: str = Query(
        ...,
        description="Occupation key (e.g., 'registered_nurses') or SOC code (e.g., '291141' or '29-1141')"
    ),
    areas: Optional[str] = Query(
        default="national,california,los_angeles",
        description="Comma-separated area keys (e.g., national,california,los_angeles,san_francisco,san_diego)"
    ),
):
    """
    Get Occupational Employment and Wage Statistics (OES) data.

    Returns employment counts and wage percentiles for an occupation across areas.

    Available occupations (use key or SOC code):
    - registered_nurses (29-1141)
    - software_developers (15-1252)
    - electricians (47-2111)
    - medical_assistants (31-9092)
    - and more... Use /oes/options for full list

    Available areas:
    - national: U.S. National
    - california: California (State)
    - los_angeles: Los Angeles-Long Beach-Anaheim, CA
    - san_francisco: San Francisco-Oakland-Hayward, CA
    - san_diego: San Diego-Carlsbad, CA
    """
    try:
        area_list = [a.strip() for a in areas.split(",") if a.strip()]

        async with BLSClient() as client:
            data = await client.get_oes_wages(
                occupation=occupation,
                areas=area_list,
            )

            return OESResponse(
                data=data,
                occupation=occupation,
                areas=area_list,
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch OES data: {str(e)}")


@router.get("/unemployment", response_model=UnemploymentResponse)
async def get_unemployment(
    areas: Optional[str] = Query(
        default="california,los_angeles,national",
        description="Comma-separated area keys (e.g., california,los_angeles,san_francisco,san_diego,national)"
    ),
    start_year: Optional[int] = Query(default=None, description="Start year (defaults to 3 years ago)"),
    end_year: Optional[int] = Query(default=None, description="End year (defaults to current year)"),
):
    """
    Get unemployment rates for California areas.

    Available areas:
    - california: California statewide
    - los_angeles: Los Angeles metro area
    - san_francisco: San Francisco metro area
    - san_diego: San Diego metro area
    - national: U.S. national rate
    """
    try:
        area_list = [a.strip() for a in areas.split(",") if a.strip()]

        async with BLSClient() as client:
            data = await client.get_unemployment_rates(
                areas=area_list,
                start_year=start_year,
                end_year=end_year,
            )

            return UnemploymentResponse(
                data=data,
                areas=area_list,
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch unemployment data: {str(e)}")


@router.get("/cpi", response_model=CPIResponse)
async def get_cpi(
    areas: Optional[str] = Query(
        default="los_angeles,national",
        description="Comma-separated area keys (e.g., los_angeles,san_francisco,national)"
    ),
    start_year: Optional[int] = Query(default=None, description="Start year (defaults to 3 years ago)"),
    end_year: Optional[int] = Query(default=None, description="End year (defaults to current year)"),
):
    """
    Get Consumer Price Index (CPI) data for specified areas.

    Available areas:
    - los_angeles: Los Angeles-Long Beach-Anaheim
    - san_francisco: San Francisco-Oakland-San Jose
    - national: U.S. City Average
    """
    try:
        area_list = [a.strip() for a in areas.split(",") if a.strip()]

        async with BLSClient() as client:
            data = await client.get_cpi_data(
                areas=area_list,
                start_year=start_year,
                end_year=end_year,
            )

            return CPIResponse(
                data=data,
                areas=area_list,
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch CPI data: {str(e)}")


@router.get("/series", response_model=SeriesResponse)
async def get_series(
    ids: str = Query(
        ...,
        description="Comma-separated BLS series IDs (e.g., LNS14000000,CUUR0000SA0)"
    ),
    start_year: Optional[int] = Query(default=None, description="Start year"),
    end_year: Optional[int] = Query(default=None, description="End year"),
):
    """
    Fetch data for specific BLS series by their IDs.

    This is a flexible endpoint for querying any BLS series.
    Find series IDs at: https://www.bls.gov/help/hlpforma.htm
    """
    try:
        series_ids = [s.strip().upper() for s in ids.split(",") if s.strip()]

        if not series_ids:
            raise HTTPException(status_code=400, detail="At least one series ID is required")

        if len(series_ids) > 50:
            raise HTTPException(status_code=400, detail="Maximum 50 series IDs per request")

        async with BLSClient() as client:
            data = await client.fetch_custom_series(
                series_ids=series_ids,
                start_year=start_year,
                end_year=end_year,
            )

            return SeriesResponse(series=data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch series data: {str(e)}")


@router.get("/popular", response_model=PopularSeriesResponse)
async def get_popular_series():
    """
    Get a list of popular/useful BLS series IDs.

    Returns a curated list of commonly used series including:
    - National unemployment rate
    - California unemployment rates
    - Consumer Price Index data
    """
    try:
        async with BLSClient() as client:
            series_ids = await client.get_popular_series()
            return PopularSeriesResponse(series_ids=series_ids)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch popular series: {str(e)}")


# ============================================================================
# Employment Projections Endpoints
# ============================================================================

class ProjectionResponse(BaseModel):
    """Response for a single occupation projection."""
    projection: OccupationProjection
    has_data: bool = True


class ProjectionSearchResponse(BaseModel):
    """Response for projection search."""
    results: List[OccupationProjection]
    query: str
    total: int


class EducationLevelInfo(BaseModel):
    """Education level information."""
    code: str
    label: str


class ProjectionOptionsResponse(BaseModel):
    """Response for available projection options."""
    education_levels: List[EducationLevelInfo]
    experience_levels: List[EducationLevelInfo]
    training_levels: List[EducationLevelInfo]
    available_occupations: int


@router.get("/projections/options", response_model=ProjectionOptionsResponse)
async def get_projection_options():
    """
    Get available options for projection queries.

    Returns education levels, experience levels, and training levels used in projections.
    """
    education = [
        EducationLevelInfo(code=code, label=label)
        for code, label in EDUCATION_LEVELS.items()
    ]
    experience = [
        EducationLevelInfo(code=code, label=label)
        for code, label in EXPERIENCE_LEVELS.items()
    ]
    training = [
        EducationLevelInfo(code=code, label=label)
        for code, label in TRAINING_LEVELS.items()
    ]
    return ProjectionOptionsResponse(
        education_levels=education,
        experience_levels=experience,
        training_levels=training,
        available_occupations=len(get_available_soc_codes()),
    )


@router.get("/projections/search", response_model=ProjectionSearchResponse)
async def search_projections_endpoint(
    q: str = Query(
        ...,
        min_length=2,
        description="Search query (min 2 characters). Matches occupation title or SOC code."
    ),
    limit: int = Query(
        default=20,
        ge=1,
        le=50,
        description="Maximum results to return (1-50)"
    ),
):
    """
    Search occupations with projection data.

    Returns matching occupations that have 10-year employment projections and
    education/training requirements data.

    Examples:
    - Search by title: "nurse", "software", "electric"
    - Search by SOC code: "29-1141", "151252"
    """
    results = search_projections(q, limit=limit)
    return ProjectionSearchResponse(
        results=results,
        query=q,
        total=len(results),
    )


@router.get("/projections/{soc_code}", response_model=ProjectionResponse)
async def get_occupation_projection(
    soc_code: str,
):
    """
    Get 10-year employment projection with education requirements.

    Returns projection data including:
    - Employment figures (2023 base, 2033 projected)
    - Growth rate and numeric change
    - Annual job openings
    - Entry-level education required
    - Work experience requirements
    - On-the-job training requirements
    - Career outlook (much faster, faster, average, slower, decline)

    Args:
        soc_code: SOC code (e.g., "291141" or "29-1141")
    """
    projection = get_projection(soc_code)

    if not projection:
        raise HTTPException(
            status_code=404,
            detail=f"No projection data available for SOC code: {soc_code}. "
                   f"Use /projections/search to find available occupations."
        )

    return ProjectionResponse(projection=projection)
