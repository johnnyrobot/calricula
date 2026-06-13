"""
Labor Market Information (LMI) Client
=====================================

Client for accessing California EDD data via the data.ca.gov CKAN API.
Provides access to:
- Occupational Wages (OEWS)
- Employment Projections (Long-term)

Data Source: https://data.ca.gov

IMPORTANT: The OEWS dataset has SEPARATE ROWS for hourly and annual wages,
distinguished by the "Wage Type" field. This client fetches hourly wage rows
and calculates annual wages (hourly * 2080 hours).
"""

from typing import Optional, List, Dict, Any
import httpx
from pydantic import BaseModel, Field

# API Configuration
CKAN_BASE_URL = "https://data.ca.gov/api/3/action"

# Resource IDs from data.ca.gov
# OEWS 2009-2025 dataset
RES_ID_WAGES = "aef4c53a-7e17-418c-acc1-d189e39b6caa"

# Long-Term Occupational Employment Projections (2023-2033)
RES_ID_OCC_PROJ = "274e273c-d18c-4d84-b8df-49b4d13c14ce"


class WageData(BaseModel):
    """Occupational wage data from OEWS survey."""
    year: str
    area: str
    area_type: Optional[str] = None
    occupation_title: str
    soc_code: Optional[str] = None
    employment: Optional[int] = None
    # Hourly wages
    hourly_mean: Optional[float] = None
    hourly_median: Optional[float] = None
    hourly_10th: Optional[float] = None
    hourly_25th: Optional[float] = None
    hourly_75th: Optional[float] = None
    hourly_90th: Optional[float] = None
    # Annual wages (calculated from hourly * 2080)
    annual_mean: Optional[float] = None
    annual_median: Optional[float] = None

    class Config:
        populate_by_name = True


class ProjectionData(BaseModel):
    """Long-term occupational employment projections."""
    area: str
    area_type: Optional[str] = None
    occupation_title: str
    soc_code: Optional[str] = None
    period: Optional[str] = None  # e.g., "2023-2033"
    base_year: Optional[str] = None
    proj_year: Optional[str] = None
    emp_base: Optional[int] = None
    emp_proj: Optional[int] = None
    numeric_change: Optional[int] = None
    percent_change: Optional[float] = None
    exits: Optional[int] = None
    transfers: Optional[int] = None
    total_openings: Optional[int] = None
    # Wages from projections dataset
    median_hourly_wage: Optional[float] = None
    median_annual_wage: Optional[float] = None
    # Education requirements (crucial for CTE)
    entry_level_education: Optional[str] = None
    work_experience: Optional[str] = None
    job_training: Optional[str] = None


class LMIClient:
    """
    Async client for California LMI data.
    """

    def __init__(self, timeout: float = 30.0):
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self) -> "LMIClient":
        self._client = httpx.AsyncClient(timeout=self.timeout)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError("Client not initialized. Use 'async with LMIClient() as client:'")
        return self._client

    def _parse_float(self, value: Any) -> Optional[float]:
        """Safely parse a float value, handling special cases."""
        if value is None:
            return None
        try:
            val = float(value)
            # OEWS uses 0 to indicate suppressed/unavailable data
            return val if val > 0 else None
        except (ValueError, TypeError):
            return None

    def _parse_int(self, value: Any) -> Optional[int]:
        """Safely parse an integer value."""
        if value is None:
            return None
        try:
            return int(float(value))
        except (ValueError, TypeError):
            return None

    async def search_wages(self, keyword: str, limit: int = 10, area: Optional[str] = None) -> List[WageData]:
        """
        Search for wage data by occupation keyword.

        IMPORTANT: Filters for "Hourly wage" type only to avoid mixing
        hourly and annual values. Annual wages are calculated from hourly.

        Args:
            keyword: Occupation search term (e.g., "nurse", "software")
            limit: Maximum results to return
            area: Optional area filter (e.g., "California", "Los Angeles")
        """
        import json

        # Build filters - MUST filter for Hourly wage type
        filters = {"Wage Type": "Hourly wage"}

        params = {
            "resource_id": RES_ID_WAGES,
            "q": keyword,
            "filters": json.dumps(filters),
            "limit": limit * 3,  # Fetch extra for filtering
            "sort": "Year desc"
        }

        resp = await self.client.get(f"{CKAN_BASE_URL}/datastore_search", params=params)
        resp.raise_for_status()
        result = resp.json().get("result", {})
        records = result.get("records", [])

        wages = []
        seen_keys = set()  # Dedupe by occupation + area + year

        for r in records:
            try:
                occ_title = str(r.get("Occupational Title", ""))
                # Simple validation to ensure it matches keyword somewhat
                if keyword.lower() not in occ_title.lower():
                    continue

                area_name = r.get("Area Name", "Unknown")
                year = str(r.get("Year", ""))

                # Optional area filtering
                if area and area.lower() not in area_name.lower():
                    continue

                # Dedupe key
                key = f"{occ_title}|{area_name}|{year}"
                if key in seen_keys:
                    continue
                seen_keys.add(key)

                # Parse hourly wages
                hourly_mean = self._parse_float(r.get("Mean Wage"))
                hourly_median = self._parse_float(r.get("50th Percentile (Median) Wage"))
                hourly_10th = self._parse_float(r.get("10th Percentile Wage"))
                hourly_25th = self._parse_float(r.get("25th Percentile Wage"))
                hourly_75th = self._parse_float(r.get("75th Percentile Wage"))
                hourly_90th = self._parse_float(r.get("90th Percentile Wage"))

                # Calculate annual wages (hourly * 2080 hours/year)
                annual_mean = round(hourly_mean * 2080, 2) if hourly_mean else None
                annual_median = round(hourly_median * 2080, 2) if hourly_median else None

                wages.append(WageData(
                    year=year,
                    area=area_name,
                    area_type=r.get("Area Type"),
                    occupation_title=occ_title,
                    soc_code=r.get("Standard Occupational Classification"),
                    employment=self._parse_int(r.get("Number of Employed")),
                    hourly_mean=hourly_mean,
                    hourly_median=hourly_median,
                    hourly_10th=hourly_10th,
                    hourly_25th=hourly_25th,
                    hourly_75th=hourly_75th,
                    hourly_90th=hourly_90th,
                    annual_mean=annual_mean,
                    annual_median=annual_median,
                ))
            except Exception:
                continue

        return wages[:limit]

    async def search_projections(self, keyword: str, limit: int = 10, area: Optional[str] = None) -> List[ProjectionData]:
        """
        Search for long-term employment projections.

        Includes education requirements, work experience, and job training
        fields that are crucial for CTE program compliance.

        Args:
            keyword: Occupation search term
            limit: Maximum results to return
            area: Optional area filter
        """
        params = {
            "resource_id": RES_ID_OCC_PROJ,
            "q": keyword,
            "limit": limit * 3,
            "sort": "Period desc"
        }

        resp = await self.client.get(f"{CKAN_BASE_URL}/datastore_search", params=params)
        resp.raise_for_status()
        result = resp.json().get("result", {})
        records = result.get("records", [])

        projections = []
        seen_keys = set()

        for r in records:
            try:
                occ_title = str(r.get("Occupational Title", ""))
                if keyword.lower() not in occ_title.lower():
                    continue

                area_name = r.get("Area Name", "Unknown")
                period = str(r.get("Period", ""))

                # Optional area filtering
                if area and area.lower() not in area_name.lower():
                    continue

                # Dedupe key
                key = f"{occ_title}|{area_name}|{period}"
                if key in seen_keys:
                    continue
                seen_keys.add(key)

                # Extract years from Period (e.g. "2023-2033")
                base_year, proj_year = "", ""
                if "-" in period:
                    parts = period.split("-")
                    if len(parts) >= 2:
                        base_year, proj_year = parts[0].strip(), parts[1].strip()

                # Parse education requirements (clean up N/A values)
                entry_education = r.get("Entry Level Education")
                if entry_education in ("N/A", "n/a", None, ""):
                    entry_education = None

                work_exp = r.get("Work Experience")
                if work_exp in ("N/A", "n/a", None, ""):
                    work_exp = None

                job_train = r.get("Job Training")
                if job_train in ("N/A", "n/a", None, ""):
                    job_train = None

                projections.append(ProjectionData(
                    area=area_name,
                    area_type=r.get("Area Type"),
                    occupation_title=occ_title,
                    soc_code=r.get("Standard Occupational Classification (SOC)"),
                    period=period,
                    base_year=base_year,
                    proj_year=proj_year,
                    emp_base=self._parse_int(r.get("Base Year Employment Estimate")),
                    emp_proj=self._parse_int(r.get("Projected Year Employment Estimate")),
                    numeric_change=self._parse_int(r.get("Numeric Change")),
                    percent_change=self._parse_float(r.get("Percentage Change")),
                    exits=self._parse_int(r.get("Exits")),
                    transfers=self._parse_int(r.get("Transfers")),
                    total_openings=self._parse_int(r.get("Total Job Openings")),
                    median_hourly_wage=self._parse_float(r.get("Median Hourly Wage")),
                    median_annual_wage=self._parse_float(r.get("Median Annual Wage")),
                    entry_level_education=entry_education,
                    work_experience=work_exp,
                    job_training=job_train,
                ))
            except Exception:
                continue

        return projections[:limit]

    async def search_wages_by_soc(self, soc_code: str, area: Optional[str] = None) -> List[WageData]:
        """
        Search for wage data by SOC code (exact match).

        This is used for refreshing existing LMI data when we already have a SOC code.

        Args:
            soc_code: SOC code (e.g., "29-1141" or "291141")
            area: Optional area filter (e.g., "Los Angeles County")
        """
        import json

        # Normalize SOC code - CKAN stores them without hyphens
        normalized_soc = soc_code.replace("-", "")

        # Build filters - use only SOC code filter (more reliable than multi-key filters)
        filters = {"Standard Occupational Classification": normalized_soc}

        params = {
            "resource_id": RES_ID_WAGES,
            "filters": json.dumps(filters),
            "limit": 100,  # Get more results for SOC code
            "sort": "Year desc"
        }

        resp = await self.client.get(f"{CKAN_BASE_URL}/datastore_search", params=params)
        resp.raise_for_status()
        result = resp.json().get("result", {})
        records = result.get("records", [])

        wages = []
        seen_keys = set()  # Dedupe by occupation + area + year

        for r in records:
            try:
                occ_title = str(r.get("Occupational Title", ""))
                area_name = r.get("Area Name", "Unknown")
                year = str(r.get("Year", ""))

                # Optional area filtering
                if area and area.lower() not in area_name.lower():
                    continue

                # Dedupe key
                key = f"{occ_title}|{area_name}|{year}"
                if key in seen_keys:
                    continue
                seen_keys.add(key)

                # Parse hourly wages
                hourly_mean = self._parse_float(r.get("Mean Wage"))
                hourly_median = self._parse_float(r.get("50th Percentile (Median) Wage"))
                hourly_10th = self._parse_float(r.get("10th Percentile Wage"))
                hourly_25th = self._parse_float(r.get("25th Percentile Wage"))
                hourly_75th = self._parse_float(r.get("75th Percentile Wage"))
                hourly_90th = self._parse_float(r.get("90th Percentile Wage"))

                # Calculate annual wages (hourly * 2080 hours/year)
                annual_mean = round(hourly_mean * 2080, 2) if hourly_mean else None
                annual_median = round(hourly_median * 2080, 2) if hourly_median else None

                wages.append(WageData(
                    year=year,
                    area=area_name,
                    area_type=r.get("Area Type"),
                    occupation_title=occ_title,
                    soc_code=r.get("Standard Occupational Classification"),
                    employment=self._parse_int(r.get("Number of Employed")),
                    hourly_mean=hourly_mean,
                    hourly_median=hourly_median,
                    hourly_10th=hourly_10th,
                    hourly_25th=hourly_25th,
                    hourly_75th=hourly_75th,
                    hourly_90th=hourly_90th,
                    annual_mean=annual_mean,
                    annual_median=annual_median,
                ))
            except Exception:
                continue

        return wages

    async def search_projections_by_soc(self, soc_code: str, area: Optional[str] = None) -> List[ProjectionData]:
        """
        Search for projections by SOC code (exact match).

        This is used for refreshing existing LMI data when we already have a SOC code.

        Args:
            soc_code: SOC code (e.g., "29-1141" or "291141")
            area: Optional area filter
        """
        # Normalize SOC code - CKAN stores them without hyphens
        normalized_soc = soc_code.replace("-", "")

        params = {
            "resource_id": RES_ID_OCC_PROJ,
            "filters": json.dumps({"Standard Occupational Classification (SOC)": normalized_soc}),
            "limit": 100,
            "sort": "Period desc"
        }

        resp = await self.client.get(f"{CKAN_BASE_URL}/datastore_search", params=params)
        resp.raise_for_status()
        result = resp.json().get("result", {})
        records = result.get("records", [])

        projections = []
        seen_keys = set()

        for r in records:
            try:
                occ_title = str(r.get("Occupational Title", ""))
                area_name = r.get("Area Name", "Unknown")
                period = str(r.get("Period", ""))

                # Optional area filtering
                if area and area.lower() not in area_name.lower():
                    continue

                # Dedupe key
                key = f"{occ_title}|{area_name}|{period}"
                if key in seen_keys:
                    continue
                seen_keys.add(key)

                # Extract years from Period (e.g. "2023-2033")
                base_year, proj_year = "", ""
                if "-" in period:
                    parts = period.split("-")
                    if len(parts) >= 2:
                        base_year, proj_year = parts[0].strip(), parts[1].strip()

                # Parse education requirements (clean up N/A values)
                entry_education = r.get("Entry Level Education")
                if entry_education in ("N/A", "n/a", None, ""):
                    entry_education = None

                work_exp = r.get("Work Experience")
                if work_exp in ("N/A", "n/a", None, ""):
                    work_exp = None

                job_train = r.get("Job Training")
                if job_train in ("N/A", "n/a", None, ""):
                    job_train = None

                projections.append(ProjectionData(
                    area=area_name,
                    area_type=r.get("Area Type"),
                    occupation_title=occ_title,
                    soc_code=r.get("Standard Occupational Classification (SOC)"),
                    period=period,
                    base_year=base_year,
                    proj_year=proj_year,
                    emp_base=self._parse_int(r.get("Base Year Employment Estimate")),
                    emp_proj=self._parse_int(r.get("Projected Year Employment Estimate")),
                    numeric_change=self._parse_int(r.get("Numeric Change")),
                    percent_change=self._parse_float(r.get("Percentage Change")),
                    exits=self._parse_int(r.get("Exits")),
                    transfers=self._parse_int(r.get("Transfers")),
                    total_openings=self._parse_int(r.get("Total Job Openings")),
                    median_hourly_wage=self._parse_float(r.get("Median Hourly Wage")),
                    median_annual_wage=self._parse_float(r.get("Median Annual Wage")),
                    entry_level_education=entry_education,
                    work_experience=work_exp,
                    job_training=job_train,
                ))
            except Exception:
                continue

        return projections
