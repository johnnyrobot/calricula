from typing import List, Optional
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel

from app.services.lmi_client import LMIClient, WageData, ProjectionData

router = APIRouter()

class LMIResponse(BaseModel):
    wages: List[WageData]
    projections: List[ProjectionData]

@router.get("/search", response_model=LMIResponse)
async def search_lmi(q: str = Query(..., min_length=2, description="Occupation keyword")):
    """
    Search for Labor Market Information (Wages and Projections) for a given occupation.
    """
    try:
        async with LMIClient() as client:
            # Run searches in parallel (conceptually, though here we await sequentially for simplicity)
            wages = await client.search_wages(q)
            projections = await client.search_projections(q)
            
            return LMIResponse(
                wages=wages,
                projections=projections
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch LMI data: {str(e)}")
