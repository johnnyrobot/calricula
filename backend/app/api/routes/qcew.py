"""
QCEW (Quarterly Census of Employment and Wages) API Routes
==========================================================

Endpoints for accessing county-level employment and wage data by industry.
Data source: BLS QCEW Open Data API
"""

from typing import List, Optional
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel

from app.services.qcew_client import (
    QCEWClient,
    QCEWAreaSummary,
    QCEWIndustryData,
    AreaInfo,
    IndustryInfo,
    QCEW_AREAS,
    KEY_INDUSTRIES,
)

router = APIRouter()


# Response Models
class QCEWAreasResponse(BaseModel):
    """Response for available areas."""
    areas: List[AreaInfo]


class QCEWIndustriesResponse(BaseModel):
    """Response for available industries."""
    industries: List[IndustryInfo]


class QCEWSummaryResponse(BaseModel):
    """Response for area summary."""
    summary: QCEWAreaSummary


class QCEWIndustryResponse(BaseModel):
    """Response for single industry data."""
    data: QCEWIndustryData


@router.get("/areas", response_model=QCEWAreasResponse)
async def get_available_areas():
    """
    Get list of available areas for QCEW queries.

    Returns California counties available in the QCEW database.
    """
    async with QCEWClient() as client:
        areas = client.get_available_areas()
        return QCEWAreasResponse(areas=areas)


@router.get("/industries", response_model=QCEWIndustriesResponse)
async def get_available_industries():
    """
    Get list of key industries tracked.

    Returns 2-digit NAICS industry sectors commonly used for workforce analysis.
    """
    async with QCEWClient() as client:
        industries = client.get_available_industries()
        return QCEWIndustriesResponse(industries=industries)


@router.get("/summary/{area}", response_model=QCEWSummaryResponse)
async def get_area_summary(
    area: str,
    year: Optional[int] = Query(default=None, description="Year (defaults to latest available)"),
    quarter: Optional[int] = Query(
        default=None,
        ge=1,
        le=4,
        description="Quarter 1-4 (defaults to latest available)"
    ),
):
    """
    Get employment summary for an area.

    Returns total employment, establishments, average wages, and breakdown by industry
    for the specified area and time period.

    Available areas:
    - los_angeles: Los Angeles County, CA
    - california: California (statewide)
    - orange: Orange County, CA
    - san_diego: San Diego County, CA
    - san_bernardino: San Bernardino County, CA
    - riverside: Riverside County, CA

    Note: QCEW data has approximately 6-month lag. If specific year/quarter not
    available, will return most recent available data.
    """
    if area not in QCEW_AREAS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown area: {area}. Available areas: {list(QCEW_AREAS.keys())}"
        )

    try:
        async with QCEWClient() as client:
            summary = await client.get_area_summary(
                area=area,
                year=year,
                quarter=quarter,
            )
            return QCEWSummaryResponse(summary=summary)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch QCEW data: {str(e)}"
        )


@router.get("/summary", response_model=QCEWSummaryResponse)
async def get_default_summary(
    year: Optional[int] = Query(default=None, description="Year (defaults to latest available)"),
    quarter: Optional[int] = Query(
        default=None,
        ge=1,
        le=4,
        description="Quarter 1-4 (defaults to latest available)"
    ),
):
    """
    Get employment summary for LA County (default area).

    Convenience endpoint that returns Los Angeles County data by default.
    Use /summary/{area} to query other areas.
    """
    try:
        async with QCEWClient() as client:
            summary = await client.get_area_summary(
                area="los_angeles",
                year=year,
                quarter=quarter,
            )
            return QCEWSummaryResponse(summary=summary)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch QCEW data: {str(e)}"
        )


@router.get("/industry/{area}/{industry_code}", response_model=QCEWIndustryResponse)
async def get_industry_data(
    area: str,
    industry_code: str,
    year: Optional[int] = Query(default=None, description="Year"),
    quarter: Optional[int] = Query(default=None, ge=1, le=4, description="Quarter 1-4"),
):
    """
    Get data for a specific industry in an area.

    Args:
        area: Area key (e.g., "los_angeles")
        industry_code: 2-digit NAICS code (e.g., "62" for Healthcare)
        year: Year (optional, defaults to latest)
        quarter: Quarter 1-4 (optional, defaults to latest)

    Common industry codes:
    - 62: Health Care and Social Assistance
    - 31-33: Manufacturing
    - 23: Construction
    - 72: Accommodation and Food Services
    - 54: Professional and Technical Services
    - 48-49: Transportation and Warehousing
    - 44-45: Retail Trade
    - 51: Information
    """
    if area not in QCEW_AREAS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown area: {area}. Available areas: {list(QCEW_AREAS.keys())}"
        )

    try:
        async with QCEWClient() as client:
            data = await client.get_industry_data(
                area=area,
                industry_code=industry_code,
                year=year,
                quarter=quarter,
            )

            if not data:
                raise HTTPException(
                    status_code=404,
                    detail=f"No data found for industry {industry_code} in {area}"
                )

            return QCEWIndustryResponse(data=data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch QCEW data: {str(e)}"
        )
