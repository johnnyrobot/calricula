"""
QCEW (Quarterly Census of Employment and Wages) Client
======================================================

Client for accessing BLS QCEW data via the Open Data API.
Provides county-level employment and wage data by industry.

API Documentation: https://www.bls.gov/cew/additional-resources/open-data/home.htm
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
import csv
import io
import httpx
from pydantic import BaseModel, Field


# API Configuration
QCEW_API_BASE = "https://data.bls.gov/cew/data/api"

# Available areas for QCEW queries
QCEW_AREAS = {
    "los_angeles": {
        "fips": "06037",
        "name": "Los Angeles County, CA",
        "state_fips": "06",
        "county_fips": "037"
    },
    "california": {
        "fips": "06000",
        "name": "California",
        "state_fips": "06",
        "county_fips": "000"
    },
    "orange": {
        "fips": "06059",
        "name": "Orange County, CA",
        "state_fips": "06",
        "county_fips": "059"
    },
    "san_diego": {
        "fips": "06073",
        "name": "San Diego County, CA",
        "state_fips": "06",
        "county_fips": "073"
    },
    "san_bernardino": {
        "fips": "06071",
        "name": "San Bernardino County, CA",
        "state_fips": "06",
        "county_fips": "071"
    },
    "riverside": {
        "fips": "06065",
        "name": "Riverside County, CA",
        "state_fips": "06",
        "county_fips": "065"
    },
}

# Key industries for LA/CTE programs (2-digit NAICS supersectors)
KEY_INDUSTRIES = {
    "10": {"naics": "10", "name": "Total, All Industries"},
    "62": {"naics": "62", "name": "Health Care and Social Assistance"},
    "31-33": {"naics": "31-33", "name": "Manufacturing"},
    "23": {"naics": "23", "name": "Construction"},
    "72": {"naics": "72", "name": "Accommodation and Food Services"},
    "54": {"naics": "54", "name": "Professional and Technical Services"},
    "48-49": {"naics": "48-49", "name": "Transportation and Warehousing"},
    "44-45": {"naics": "44-45", "name": "Retail Trade"},
    "51": {"naics": "51", "name": "Information"},
    "52": {"naics": "52", "name": "Finance and Insurance"},
    "56": {"naics": "56", "name": "Administrative and Waste Services"},
    "61": {"naics": "61", "name": "Educational Services"},
    "71": {"naics": "71", "name": "Arts, Entertainment, and Recreation"},
    "81": {"naics": "81", "name": "Other Services"},
    "42": {"naics": "42", "name": "Wholesale Trade"},
    "53": {"naics": "53", "name": "Real Estate and Rental and Leasing"},
    "55": {"naics": "55", "name": "Management of Companies"},
    "11": {"naics": "11", "name": "Agriculture, Forestry, Fishing and Hunting"},
    "21": {"naics": "21", "name": "Mining, Quarrying, and Oil and Gas"},
    "22": {"naics": "22", "name": "Utilities"},
}

# Ownership codes
OWNERSHIP_CODES = {
    "0": "Total Covered",
    "5": "Private",
    "1": "Federal Government",
    "2": "State Government",
    "3": "Local Government",
}


class QCEWIndustryData(BaseModel):
    """QCEW data for a single industry in an area."""
    area_fips: str
    area_name: str
    industry_code: str
    industry_name: str
    year: int
    quarter: int
    ownership: str
    ownership_label: str
    establishments: Optional[int] = None
    month1_employment: Optional[int] = None
    month2_employment: Optional[int] = None
    month3_employment: Optional[int] = None
    total_quarterly_wages: Optional[int] = None
    avg_weekly_wage: Optional[float] = None


class QCEWAreaSummary(BaseModel):
    """Summary of QCEW data for an area."""
    area_fips: str
    area_name: str
    year: int
    quarter: int
    total_employment: Optional[int] = None
    total_establishments: Optional[int] = None
    avg_weekly_wage: Optional[float] = None
    industries: List[QCEWIndustryData] = Field(default_factory=list)


class AreaInfo(BaseModel):
    """Area information for QCEW queries."""
    key: str
    fips: str
    name: str


class IndustryInfo(BaseModel):
    """Industry information for QCEW queries."""
    naics: str
    name: str


class QCEWClient:
    """
    Async client for BLS QCEW Open Data API.

    The QCEW API returns CSV data for a specific area and time period.
    URL pattern: https://data.bls.gov/cew/data/api/{YEAR}/{QTR}/area/{FIPS}.csv

    Usage:
        async with QCEWClient() as client:
            data = await client.get_area_summary("los_angeles")
    """

    def __init__(self, timeout: float = 30.0):
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self) -> "QCEWClient":
        self._client = httpx.AsyncClient(timeout=self.timeout)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError("Client not initialized. Use 'async with QCEWClient() as client:'")
        return self._client

    def _parse_int(self, value: Any) -> Optional[int]:
        """Safely parse an integer value."""
        if value is None or value == "" or value == "N" or value == "(D)":
            return None
        try:
            return int(float(value))
        except (ValueError, TypeError):
            return None

    def _parse_float(self, value: Any) -> Optional[float]:
        """Safely parse a float value."""
        if value is None or value == "" or value == "N" or value == "(D)":
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    def _get_latest_quarter(self) -> tuple[int, int]:
        """
        Get the latest available quarter.
        QCEW data has about a 6-month lag.
        """
        now = datetime.now()
        # Go back 6 months to ensure data is available
        if now.month <= 6:
            # First half of year, use Q2 of previous year
            return now.year - 1, 2
        else:
            # Second half, use Q4 of previous year or Q1 of current year
            return now.year - 1, 4

    async def fetch_area_csv(
        self,
        area_fips: str,
        year: Optional[int] = None,
        quarter: Optional[int] = None,
    ) -> List[Dict[str, str]]:
        """
        Fetch raw CSV data for an area.

        Args:
            area_fips: FIPS code for the area
            year: Year (defaults to latest available)
            quarter: Quarter 1-4 (defaults to latest available)

        Returns:
            List of dictionaries representing CSV rows
        """
        if year is None or quarter is None:
            year, quarter = self._get_latest_quarter()

        url = f"{QCEW_API_BASE}/{year}/{quarter}/area/{area_fips}.csv"

        try:
            response = await self.client.get(url)
            response.raise_for_status()

            # Parse CSV
            content = response.text
            reader = csv.DictReader(io.StringIO(content))
            return list(reader)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                # Try earlier quarter if not found
                if quarter > 1:
                    return await self.fetch_area_csv(area_fips, year, quarter - 1)
                elif year > datetime.now().year - 2:
                    return await self.fetch_area_csv(area_fips, year - 1, 4)
            raise

    async def get_area_summary(
        self,
        area: str = "los_angeles",
        year: Optional[int] = None,
        quarter: Optional[int] = None,
    ) -> QCEWAreaSummary:
        """
        Get employment summary for an area.

        Args:
            area: Area key (e.g., "los_angeles", "california")
            year: Year (defaults to latest available)
            quarter: Quarter 1-4 (defaults to latest available)

        Returns:
            QCEWAreaSummary with total employment and industry breakdown
        """
        area_info = QCEW_AREAS.get(area)
        if not area_info:
            raise ValueError(f"Unknown area: {area}. Available: {list(QCEW_AREAS.keys())}")

        if year is None or quarter is None:
            year, quarter = self._get_latest_quarter()

        rows = await self.fetch_area_csv(area_info["fips"], year, quarter)

        # Filter for private sector (own_code = 5) and supersector industries
        industries = []
        total_row = None

        for row in rows:
            own_code = row.get("own_code", "")
            industry_code = row.get("industry_code", "")
            agglvl_code = row.get("agglvl_code", "")

            # We want:
            # - Total all industries, private sector (industry_code = "10", agglvl_code = "71")
            # - 2-digit NAICS industries, private sector (agglvl_code = "74")
            # - Private sector (own_code = "5")

            if own_code != "5":
                continue

            # Total all industries for private sector
            if industry_code == "10" and agglvl_code == "71":
                total_row = row
                continue

            # 2-digit NAICS industries (private sector supersector level)
            if agglvl_code == "74":
                industry_name = KEY_INDUSTRIES.get(industry_code, {}).get("name")
                if not industry_name:
                    # Use the industry title from CSV if not in our map
                    industry_name = row.get("industry_title", f"Industry {industry_code}")

                industries.append(QCEWIndustryData(
                    area_fips=area_info["fips"],
                    area_name=area_info["name"],
                    industry_code=industry_code,
                    industry_name=industry_name,
                    year=year,
                    quarter=quarter,
                    ownership="5",
                    ownership_label="Private",
                    establishments=self._parse_int(row.get("qtrly_estabs")),
                    month1_employment=self._parse_int(row.get("month1_emplvl")),
                    month2_employment=self._parse_int(row.get("month2_emplvl")),
                    month3_employment=self._parse_int(row.get("month3_emplvl")),
                    total_quarterly_wages=self._parse_int(row.get("total_qtrly_wages")),
                    avg_weekly_wage=self._parse_float(row.get("avg_wkly_wage")),
                ))

        # Sort industries by employment (month3) descending
        industries.sort(
            key=lambda x: x.month3_employment or 0,
            reverse=True
        )

        # Build summary
        total_emp = None
        total_estab = None
        avg_wage = None

        if total_row:
            total_emp = self._parse_int(total_row.get("month3_emplvl"))
            total_estab = self._parse_int(total_row.get("qtrly_estabs"))
            avg_wage = self._parse_float(total_row.get("avg_wkly_wage"))

        return QCEWAreaSummary(
            area_fips=area_info["fips"],
            area_name=area_info["name"],
            year=year,
            quarter=quarter,
            total_employment=total_emp,
            total_establishments=total_estab,
            avg_weekly_wage=avg_wage,
            industries=industries,
        )

    async def get_industry_data(
        self,
        area: str = "los_angeles",
        industry_code: str = "62",
        year: Optional[int] = None,
        quarter: Optional[int] = None,
    ) -> Optional[QCEWIndustryData]:
        """
        Get data for a specific industry in an area.

        Args:
            area: Area key
            industry_code: NAICS industry code (e.g., "62" for healthcare)
            year: Year
            quarter: Quarter 1-4

        Returns:
            QCEWIndustryData or None if not found
        """
        summary = await self.get_area_summary(area, year, quarter)

        for ind in summary.industries:
            if ind.industry_code == industry_code:
                return ind

        return None

    def get_available_areas(self) -> List[AreaInfo]:
        """Get list of available areas for QCEW queries."""
        return [
            AreaInfo(key=key, fips=info["fips"], name=info["name"])
            for key, info in QCEW_AREAS.items()
        ]

    def get_available_industries(self) -> List[IndustryInfo]:
        """Get list of key industries tracked."""
        return [
            IndustryInfo(naics=info["naics"], name=info["name"])
            for info in KEY_INDUSTRIES.values()
        ]
