"""
Bureau of Labor Statistics (BLS) Client
========================================

Client for accessing U.S. Bureau of Labor Statistics data via the Public Data API v2.0.
Provides access to:
- Occupational Employment and Wage Statistics (OES)
- Local Area Unemployment Statistics (LAUS)
- Consumer Price Index (CPI)

API Documentation: https://www.bls.gov/developers/api_signature_v2.htm
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
import httpx
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services.soc_occupations import get_occupation_by_code

# API Configuration
BLS_API_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/"

# California Area Codes
CALIFORNIA_AREAS = {
    "california": {"code": "ST0600000000000", "name": "California"},
    "los_angeles": {"code": "MT0631080000000", "name": "Los Angeles-Long Beach-Anaheim, CA"},
    "san_francisco": {"code": "MT0641860000000", "name": "San Francisco-Oakland-Hayward, CA"},
    "san_diego": {"code": "MT0641740000000", "name": "San Diego-Carlsbad, CA"},
}

# OES Area Codes (for Occupational Employment Statistics)
# Format: prefix (OEUN/OEUS/OEUM) + area code + industry + occupation + data type
# Prefix: N=National, S=State, M=Metro
OES_AREAS = {
    "national": {"code": "0000000", "name": "National", "prefix": "OEUN"},
    "california": {"code": "0600000", "name": "California", "prefix": "OEUS"},
    "los_angeles": {"code": "0031080", "name": "Los Angeles-Long Beach-Anaheim, CA", "prefix": "OEUM"},
    "san_francisco": {"code": "0041860", "name": "San Francisco-Oakland-Hayward, CA", "prefix": "OEUM"},
    "san_diego": {"code": "0041740", "name": "San Diego-Carlsbad, CA", "prefix": "OEUM"},
}

# Common SOC (Standard Occupational Classification) codes
# These are 6-digit codes without the hyphen
COMMON_OCCUPATIONS = {
    "all": {"code": "000000", "name": "All Occupations"},
    "software_developers": {"code": "151252", "name": "Software Developers"},
    "registered_nurses": {"code": "291141", "name": "Registered Nurses"},
    "accountants": {"code": "132011", "name": "Accountants and Auditors"},
    "teachers_postsecondary": {"code": "251000", "name": "Postsecondary Teachers"},
    "managers_general": {"code": "111021", "name": "General and Operations Managers"},
    "electricians": {"code": "472111", "name": "Electricians"},
    "plumbers": {"code": "472152", "name": "Plumbers, Pipefitters, and Steamfitters"},
    "hvac": {"code": "499021", "name": "HVAC Mechanics and Installers"},
    "medical_assistants": {"code": "319092", "name": "Medical Assistants"},
    "dental_hygienists": {"code": "292021", "name": "Dental Hygienists"},
    "paralegals": {"code": "232011", "name": "Paralegals and Legal Assistants"},
    "web_developers": {"code": "151254", "name": "Web Developers"},
    "network_admins": {"code": "151244", "name": "Network and Computer Systems Administrators"},
    "carpenters": {"code": "472031", "name": "Carpenters"},
    "automotive_techs": {"code": "493023", "name": "Automotive Service Technicians"},
}

# OES Data Types
OES_DATA_TYPES = {
    "employment": "01",
    "hourly_mean": "03",
    "annual_mean": "04",
    "hourly_10th": "05",
    "hourly_25th": "06",
    "hourly_median": "07",
    "hourly_75th": "08",
    "hourly_90th": "09",
    "annual_10th": "10",
    "annual_25th": "11",
    "annual_median": "12",
    "annual_75th": "13",
    "annual_90th": "14",
}

# Default series for California
DEFAULT_SERIES = {
    "unemployment": {
        "california": "LASST060000000000003",
        "los_angeles": "LAUMT063108000000003",
        "san_francisco": "LAUMT064186000000003",
        "san_diego": "LAUMT064174000000003",
        "national": "LNS14000000",
    },
    "cpi": {
        "los_angeles": "CUURS49ASA0",
        "san_francisco": "CUURS49BSA0",
        "national": "CUUR0000SA0",
    },
}


class BLSDataPoint(BaseModel):
    """Single data point from BLS time series."""
    year: str
    period: str
    period_name: str
    value: str
    latest: Optional[str] = None
    footnotes: List[Dict[str, Any]] = Field(default_factory=list)


class BLSSeriesData(BaseModel):
    """BLS time series data with metadata."""
    series_id: str
    series_title: Optional[str] = None
    survey_name: Optional[str] = None
    area: Optional[str] = None
    data: List[BLSDataPoint] = Field(default_factory=list)


class UnemploymentData(BaseModel):
    """Unemployment rate data."""
    series_id: str
    area_name: str
    year: str
    period: str
    period_name: str
    value: float  # unemployment rate percentage
    is_latest: bool = False


class CPIData(BaseModel):
    """Consumer Price Index data."""
    series_id: str
    area_name: str
    year: str
    period: str
    period_name: str
    value: float  # CPI index value
    is_latest: bool = False


class OESData(BaseModel):
    """Occupational Employment Statistics data."""
    series_id: str
    area_name: Optional[str] = None
    occupation_name: Optional[str] = None
    year: str
    period: str
    period_name: str
    value: float  # wage or employment value
    data_type: Optional[str] = None  # e.g., "hourly_mean", "annual_mean", "employment"
    is_latest: bool = False


class OESWageData(BaseModel):
    """Complete OES wage data for an occupation in an area."""
    area_code: str
    area_name: str
    occupation_code: str
    occupation_name: str
    year: str
    employment: Optional[int] = None
    hourly_mean: Optional[float] = None
    hourly_median: Optional[float] = None
    hourly_10th: Optional[float] = None
    hourly_25th: Optional[float] = None
    hourly_75th: Optional[float] = None
    hourly_90th: Optional[float] = None
    annual_mean: Optional[float] = None
    annual_median: Optional[float] = None
    annual_10th: Optional[float] = None
    annual_25th: Optional[float] = None
    annual_75th: Optional[float] = None
    annual_90th: Optional[float] = None


class BLSResponse(BaseModel):
    """Response from BLS API."""
    status: str
    response_time: int
    message: List[str] = Field(default_factory=list)
    series: List[BLSSeriesData] = Field(default_factory=list)


class BLSClient:
    """
    Async client for BLS Public Data API v2.0.

    Usage:
        async with BLSClient() as client:
            data = await client.fetch_series(["LNS14000000"])
    """

    def __init__(self, timeout: float = 30.0):
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None
        self.api_key = settings.BLS_API_KEY

    async def __aenter__(self) -> "BLSClient":
        self._client = httpx.AsyncClient(timeout=self.timeout)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError("Client not initialized. Use 'async with BLSClient() as client:'")
        return self._client

    def _parse_float(self, value: Any) -> Optional[float]:
        """Safely parse a float value."""
        if value is None:
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    async def fetch_series(
        self,
        series_ids: List[str],
        start_year: Optional[int] = None,
        end_year: Optional[int] = None,
        catalog: bool = True,
    ) -> BLSResponse:
        """
        Fetch data for one or more BLS series.

        Args:
            series_ids: List of BLS series IDs (max 50)
            start_year: Start year (defaults to 3 years ago)
            end_year: End year (defaults to current year)
            catalog: Include catalog metadata (requires API key)

        Returns:
            BLSResponse with series data
        """
        if not end_year:
            end_year = datetime.now().year
        if not start_year:
            start_year = end_year - 3

        # Build request payload
        payload: Dict[str, Any] = {
            "seriesid": series_ids,
            "startyear": str(start_year),
            "endyear": str(end_year),
        }

        # Add API key if available (enables more features)
        if self.api_key:
            payload["registrationkey"] = self.api_key
            if catalog:
                payload["catalog"] = True
            # Don't set calculations or annualaverage by default as they reduce series limit

        headers = {"Content-Type": "application/json"}

        resp = await self.client.post(
            BLS_API_URL,
            json=payload,
            headers=headers,
        )
        resp.raise_for_status()
        result = resp.json()

        # Parse response
        series_list = []
        for series in result.get("Results", {}).get("series", []):
            catalog_info = series.get("catalog", {})

            data_points = []
            for item in series.get("data", []):
                data_points.append(BLSDataPoint(
                    year=item.get("year", ""),
                    period=item.get("period", ""),
                    period_name=item.get("periodName", ""),
                    value=item.get("value", ""),
                    latest=item.get("latest"),
                    footnotes=item.get("footnotes", []),
                ))

            series_list.append(BLSSeriesData(
                series_id=series.get("seriesID", ""),
                series_title=catalog_info.get("series_title"),
                survey_name=catalog_info.get("survey_name"),
                area=catalog_info.get("area"),
                data=data_points,
            ))

        return BLSResponse(
            status=result.get("status", "UNKNOWN"),
            response_time=result.get("responseTime", 0),
            message=result.get("message", []),
            series=series_list,
        )

    async def get_unemployment_rates(
        self,
        areas: Optional[List[str]] = None,
        start_year: Optional[int] = None,
        end_year: Optional[int] = None,
    ) -> List[UnemploymentData]:
        """
        Get unemployment rates for specified areas.

        Args:
            areas: List of area keys (e.g., ["california", "los_angeles", "national"])
                   Defaults to California and major metros
            start_year: Start year
            end_year: End year

        Returns:
            List of UnemploymentData
        """
        if not areas:
            areas = ["california", "los_angeles", "national"]

        # Build series IDs
        series_ids = []
        area_map = {}
        for area in areas:
            series_id = DEFAULT_SERIES["unemployment"].get(area)
            if series_id:
                series_ids.append(series_id)
                area_map[series_id] = area

        if not series_ids:
            return []

        response = await self.fetch_series(series_ids, start_year, end_year)

        results = []
        for series in response.series:
            area_key = area_map.get(series.series_id, "unknown")
            area_name = series.area or area_key.replace("_", " ").title()

            for point in series.data:
                value = self._parse_float(point.value)
                if value is not None:
                    results.append(UnemploymentData(
                        series_id=series.series_id,
                        area_name=area_name,
                        year=point.year,
                        period=point.period,
                        period_name=point.period_name,
                        value=value,
                        is_latest=point.latest == "true",
                    ))

        # Sort by date descending
        results.sort(key=lambda x: (x.year, x.period), reverse=True)
        return results

    async def get_cpi_data(
        self,
        areas: Optional[List[str]] = None,
        start_year: Optional[int] = None,
        end_year: Optional[int] = None,
    ) -> List[CPIData]:
        """
        Get Consumer Price Index data for specified areas.

        Args:
            areas: List of area keys (e.g., ["los_angeles", "san_francisco", "national"])
            start_year: Start year
            end_year: End year

        Returns:
            List of CPIData
        """
        if not areas:
            areas = ["los_angeles", "national"]

        # Build series IDs
        series_ids = []
        area_map = {}
        for area in areas:
            series_id = DEFAULT_SERIES["cpi"].get(area)
            if series_id:
                series_ids.append(series_id)
                area_map[series_id] = area

        if not series_ids:
            return []

        response = await self.fetch_series(series_ids, start_year, end_year)

        results = []
        for series in response.series:
            area_key = area_map.get(series.series_id, "unknown")
            area_name = series.area or area_key.replace("_", " ").title()

            for point in series.data:
                value = self._parse_float(point.value)
                if value is not None:
                    results.append(CPIData(
                        series_id=series.series_id,
                        area_name=area_name,
                        year=point.year,
                        period=point.period,
                        period_name=point.period_name,
                        value=value,
                        is_latest=point.latest == "true",
                    ))

        # Sort by date descending
        results.sort(key=lambda x: (x.year, x.period), reverse=True)
        return results

    async def fetch_custom_series(
        self,
        series_ids: List[str],
        start_year: Optional[int] = None,
        end_year: Optional[int] = None,
    ) -> List[BLSSeriesData]:
        """
        Fetch any custom BLS series by ID.

        Args:
            series_ids: List of BLS series IDs
            start_year: Start year
            end_year: End year

        Returns:
            List of BLSSeriesData
        """
        response = await self.fetch_series(series_ids, start_year, end_year)
        return response.series

    async def get_popular_series(self) -> List[str]:
        """
        Get list of popular BLS series IDs.

        Returns:
            List of popular series IDs
        """
        # Return a curated list of popular/useful series
        return [
            # National
            "LNS14000000",      # National Unemployment Rate
            "CUUR0000SA0",      # CPI-U All Items (National)
            "CES0000000001",    # Total Nonfarm Employment
            # California
            "LASST060000000000003",  # California Unemployment Rate
            "LAUMT063108000000003",  # Los Angeles Unemployment Rate
            "CUURS49ASA0",           # CPI Los Angeles
            "CUURS49BSA0",           # CPI San Francisco
        ]

    def _build_oes_series_id(self, prefix: str, area_code: str, occupation_code: str, data_type: str) -> str:
        """
        Build an OES series ID.

        Format: prefix (OEUN/OEUS/OEUM) + area (7) + industry (6, always 000000) + occupation (6) + data_type (2)
        Prefix: OEUN=National, OEUS=State, OEUM=Metro
        """
        industry_code = "000000"  # All industries
        return f"{prefix}{area_code}{industry_code}{occupation_code}{data_type}"

    async def get_oes_wages(
        self,
        occupation: str,
        areas: Optional[List[str]] = None,
        start_year: Optional[int] = None,
        end_year: Optional[int] = None,
    ) -> List[OESWageData]:
        """
        Get OES wage data for an occupation across areas.

        Args:
            occupation: Occupation key (e.g., "registered_nurses") or SOC code (e.g., "291141")
            areas: List of area keys (e.g., ["california", "los_angeles", "national"])
            start_year: Start year (defaults to previous year since OES is released with 1-year lag)
            end_year: End year (defaults to previous year)

        Returns:
            List of OESWageData with complete wage information
        """
        if not areas:
            areas = ["national", "california", "los_angeles"]

        # OES data is annual and released with ~18 month lag
        # Use 2 years prior as default to ensure data is available
        # This also avoids BLS API's series limit when requesting multiple years
        current_year = datetime.now().year
        if not end_year:
            end_year = current_year - 2  # OES data takes ~18 months to release
        if not start_year:
            start_year = end_year  # Just get the latest year to stay under API limits

        # Get occupation code and name
        if occupation in COMMON_OCCUPATIONS:
            occ_code = COMMON_OCCUPATIONS[occupation]["code"]
            occ_name = COMMON_OCCUPATIONS[occupation]["name"]
        else:
            # Assume it's a raw SOC code (6 digits, no hyphen)
            occ_code = occupation.replace("-", "")
            # Look up the occupation name from our SOC database
            soc_occ = get_occupation_by_code(occ_code)
            if soc_occ:
                occ_name = soc_occ.title
            else:
                occ_name = f"SOC {occ_code[:2]}-{occ_code[2:]}"

        # Build series IDs for all data types we want
        data_types_to_fetch = [
            ("employment", "01"),
            ("hourly_mean", "03"),
            ("annual_mean", "04"),
            ("hourly_10th", "05"),
            ("hourly_25th", "06"),
            ("hourly_median", "07"),
            ("hourly_75th", "08"),
            ("hourly_90th", "09"),
            ("annual_10th", "10"),
            ("annual_25th", "11"),
            ("annual_median", "12"),
            ("annual_75th", "13"),
            ("annual_90th", "14"),
        ]

        series_ids = []
        series_map = {}  # Map series_id to (area_key, data_type)

        for area_key in areas:
            area_info = OES_AREAS.get(area_key)
            if not area_info:
                continue

            area_code = area_info["code"]
            prefix = area_info.get("prefix", "OEUM")  # Default to metro if not specified
            for data_type_name, data_type_code in data_types_to_fetch:
                series_id = self._build_oes_series_id(prefix, area_code, occ_code, data_type_code)
                series_ids.append(series_id)
                series_map[series_id] = (area_key, data_type_name)

        if not series_ids:
            return []

        # Fetch all series (disable catalog to allow up to 50 series per request)
        response = await self.fetch_series(series_ids, start_year, end_year, catalog=False)

        # Aggregate data by area
        area_data: Dict[str, Dict[str, Any]] = {}

        for series in response.series:
            mapping = series_map.get(series.series_id)
            if not mapping:
                continue

            area_key, data_type_name = mapping
            area_info = OES_AREAS.get(area_key, {})

            if area_key not in area_data:
                area_data[area_key] = {
                    "area_code": area_info.get("code", ""),
                    "area_name": series.area or area_info.get("name", area_key),
                    "occupation_code": occ_code,
                    "occupation_name": occ_name,
                    "year": "",
                }

            # Get the latest annual data point
            for point in series.data:
                if point.period == "A01":  # Annual data
                    value = self._parse_float(point.value)
                    if value is not None:
                        area_data[area_key]["year"] = point.year
                        if data_type_name == "employment":
                            area_data[area_key]["employment"] = int(value)
                        else:
                            area_data[area_key][data_type_name] = value
                    break

        # Convert to OESWageData objects
        results = []
        for area_key, data in area_data.items():
            if data.get("year"):  # Only include if we got data
                results.append(OESWageData(**data))

        return results

    async def get_oes_by_soc(
        self,
        soc_code: str,
        area: str = "national",
    ) -> Optional[OESWageData]:
        """
        Get OES wage data for a specific SOC code and area.

        Args:
            soc_code: SOC code (e.g., "29-1141" or "291141")
            area: Area key (e.g., "national", "california", "los_angeles")

        Returns:
            OESWageData or None if not found
        """
        results = await self.get_oes_wages(
            occupation=soc_code.replace("-", ""),
            areas=[area],
        )
        return results[0] if results else None

    def get_available_occupations(self) -> Dict[str, Dict[str, str]]:
        """Get list of common occupations available for OES queries."""
        return COMMON_OCCUPATIONS

    def get_available_oes_areas(self) -> Dict[str, Dict[str, str]]:
        """Get list of areas available for OES queries."""
        return OES_AREAS
