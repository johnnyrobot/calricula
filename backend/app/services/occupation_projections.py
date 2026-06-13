"""
Occupation Projections Data
===========================

Static data for BLS Employment Projections (2023-2033) with education requirements.
This data is sourced from BLS Excel downloads since education/training requirements
are not available via the BLS API.

Data source: https://www.bls.gov/emp/data/occupational-data.htm
Last updated: Based on 2023-2033 projections (released September 2024)
"""

from typing import Optional, List, Dict
from pydantic import BaseModel


# Education level codes and labels
EDUCATION_LEVELS = {
    "doctoral": "Doctoral or professional degree",
    "master": "Master's degree",
    "bachelor": "Bachelor's degree",
    "associate": "Associate's degree",
    "postsecondary": "Postsecondary nondegree award",
    "some_college": "Some college, no degree",
    "hs_diploma": "High school diploma or equivalent",
    "no_credential": "No formal educational credential"
}

# Work experience codes and labels
EXPERIENCE_LEVELS = {
    "5_years_plus": "5 years or more",
    "less_than_5": "Less than 5 years",
    "none": "None"
}

# On-the-job training codes and labels
TRAINING_LEVELS = {
    "internship": "Internship/residency",
    "apprenticeship": "Apprenticeship",
    "long_term": "Long-term on-the-job training",
    "moderate": "Moderate-term on-the-job training",
    "short_term": "Short-term on-the-job training",
    "none": "None"
}

# Outlook categories based on growth rate
OUTLOOK_CATEGORIES = {
    "much_faster": {"label": "Much faster than average", "min_growth": 8.0},
    "faster": {"label": "Faster than average", "min_growth": 4.0},
    "average": {"label": "As fast as average", "min_growth": 1.0},
    "slower": {"label": "Slower than average", "min_growth": -1.0},
    "decline": {"label": "Decline", "min_growth": float('-inf')},
}


class OccupationProjection(BaseModel):
    """Employment projection data for an occupation."""
    soc_code: str
    title: str
    employment_2023: int  # Base year employment (thousands)
    employment_2033: int  # Projected employment (thousands)
    change_percent: float
    change_numeric: int  # Change in thousands
    annual_openings: int  # Annual job openings (thousands)
    median_wage: Optional[int] = None  # Annual median wage
    entry_education: str  # Education code
    entry_education_label: str
    work_experience: str  # Experience code
    work_experience_label: str
    on_job_training: str  # Training code
    on_job_training_label: str
    outlook: str  # Outlook category
    outlook_label: str


def get_outlook(change_percent: float) -> tuple[str, str]:
    """Determine outlook category based on percent change."""
    if change_percent >= 8.0:
        return "much_faster", "Much faster than average"
    elif change_percent >= 4.0:
        return "faster", "Faster than average"
    elif change_percent >= 1.0:
        return "average", "As fast as average"
    elif change_percent >= -1.0:
        return "slower", "Slower than average"
    else:
        return "decline", "Decline"


# Projection data for ~100 common occupations
# Data based on BLS 2023-2033 Employment Projections
# Employment numbers in actual values (not thousands)
OCCUPATION_PROJECTIONS: Dict[str, Dict] = {
    # Healthcare Practitioners and Technical Occupations
    "291141": {
        "title": "Registered Nurses",
        "employment_2023": 3175400,
        "employment_2033": 3342000,
        "change_percent": 5.2,
        "change_numeric": 166600,
        "annual_openings": 193000,
        "median_wage": 86070,
        "entry_education": "bachelor",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "292021": {
        "title": "Dental Hygienists",
        "employment_2023": 235500,
        "employment_2033": 256600,
        "change_percent": 9.0,
        "change_numeric": 21100,
        "annual_openings": 15900,
        "median_wage": 87530,
        "entry_education": "associate",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "292010": {
        "title": "Clinical Laboratory Technologists and Technicians",
        "employment_2023": 341500,
        "employment_2033": 360400,
        "change_percent": 5.5,
        "change_numeric": 18900,
        "annual_openings": 26600,
        "median_wage": 60780,
        "entry_education": "bachelor",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "292034": {
        "title": "Radiologic Technologists and Technicians",
        "employment_2023": 223800,
        "employment_2033": 237900,
        "change_percent": 6.3,
        "change_numeric": 14100,
        "annual_openings": 15600,
        "median_wage": 73410,
        "entry_education": "associate",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "291171": {
        "title": "Nurse Practitioners",
        "employment_2023": 264300,
        "employment_2033": 360200,
        "change_percent": 36.3,
        "change_numeric": 95900,
        "annual_openings": 32500,
        "median_wage": 126260,
        "entry_education": "master",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "291051": {
        "title": "Pharmacists",
        "employment_2023": 327200,
        "employment_2033": 315900,
        "change_percent": -3.5,
        "change_numeric": -11300,
        "annual_openings": 13500,
        "median_wage": 136030,
        "entry_education": "doctoral",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "291123": {
        "title": "Physical Therapists",
        "employment_2023": 269100,
        "employment_2033": 287100,
        "change_percent": 6.7,
        "change_numeric": 18000,
        "annual_openings": 13000,
        "median_wage": 99710,
        "entry_education": "doctoral",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "312021": {
        "title": "Physical Therapist Assistants",
        "employment_2023": 105600,
        "employment_2033": 128900,
        "change_percent": 22.0,
        "change_numeric": 23300,
        "annual_openings": 12400,
        "median_wage": 64080,
        "entry_education": "associate",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "291126": {
        "title": "Respiratory Therapists",
        "employment_2023": 137000,
        "employment_2033": 150500,
        "change_percent": 9.8,
        "change_numeric": 13500,
        "annual_openings": 9500,
        "median_wage": 77960,
        "entry_education": "associate",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "292061": {
        "title": "Licensed Practical and Licensed Vocational Nurses",
        "employment_2023": 655900,
        "employment_2033": 696200,
        "change_percent": 6.2,
        "change_numeric": 40300,
        "annual_openings": 62400,
        "median_wage": 59730,
        "entry_education": "postsecondary",
        "work_experience": "none",
        "on_job_training": "none"
    },

    # Healthcare Support Occupations
    "319092": {
        "title": "Medical Assistants",
        "employment_2023": 764900,
        "employment_2033": 857000,
        "change_percent": 12.0,
        "change_numeric": 92100,
        "annual_openings": 119400,
        "median_wage": 42000,
        "entry_education": "postsecondary",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "311131": {
        "title": "Nursing Assistants",
        "employment_2023": 1483200,
        "employment_2033": 1514200,
        "change_percent": 2.1,
        "change_numeric": 31000,
        "annual_openings": 220700,
        "median_wage": 38200,
        "entry_education": "postsecondary",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "319091": {
        "title": "Dental Assistants",
        "employment_2023": 370600,
        "employment_2033": 394900,
        "change_percent": 6.6,
        "change_numeric": 24300,
        "annual_openings": 56400,
        "median_wage": 46540,
        "entry_education": "postsecondary",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "319094": {
        "title": "Medical Transcriptionists",
        "employment_2023": 49500,
        "employment_2033": 45100,
        "change_percent": -8.9,
        "change_numeric": -4400,
        "annual_openings": 5200,
        "median_wage": 36620,
        "entry_education": "postsecondary",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "319097": {
        "title": "Phlebotomists",
        "employment_2023": 138800,
        "employment_2033": 155100,
        "change_percent": 11.7,
        "change_numeric": 16300,
        "annual_openings": 22100,
        "median_wage": 41810,
        "entry_education": "postsecondary",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "311121": {
        "title": "Home Health and Personal Care Aides",
        "employment_2023": 3794200,
        "employment_2033": 4254800,
        "change_percent": 12.1,
        "change_numeric": 460600,
        "annual_openings": 684600,
        "median_wage": 33530,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "short_term"
    },

    # Computer and Mathematical Occupations
    "151252": {
        "title": "Software Developers",
        "employment_2023": 1831000,
        "employment_2033": 2076400,
        "change_percent": 13.4,
        "change_numeric": 245400,
        "annual_openings": 136500,
        "median_wage": 132270,
        "entry_education": "bachelor",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "151254": {
        "title": "Web Developers",
        "employment_2023": 100600,
        "employment_2033": 116200,
        "change_percent": 15.5,
        "change_numeric": 15600,
        "annual_openings": 13200,
        "median_wage": 85300,
        "entry_education": "associate",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "151244": {
        "title": "Network and Computer Systems Administrators",
        "employment_2023": 379800,
        "employment_2033": 383700,
        "change_percent": 1.0,
        "change_numeric": 3900,
        "annual_openings": 24500,
        "median_wage": 95360,
        "entry_education": "bachelor",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "151212": {
        "title": "Information Security Analysts",
        "employment_2023": 175400,
        "employment_2033": 240500,
        "change_percent": 37.1,
        "change_numeric": 65100,
        "annual_openings": 19200,
        "median_wage": 120360,
        "entry_education": "bachelor",
        "work_experience": "less_than_5",
        "on_job_training": "none"
    },
    "151211": {
        "title": "Computer Systems Analysts",
        "employment_2023": 648100,
        "employment_2033": 681700,
        "change_percent": 5.2,
        "change_numeric": 33600,
        "annual_openings": 43700,
        "median_wage": 103800,
        "entry_education": "bachelor",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "151232": {
        "title": "Computer User Support Specialists",
        "employment_2023": 729600,
        "employment_2033": 767700,
        "change_percent": 5.2,
        "change_numeric": 38100,
        "annual_openings": 68200,
        "median_wage": 59660,
        "entry_education": "some_college",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "152211": {
        "title": "Data Scientists",
        "employment_2023": 192900,
        "employment_2033": 246900,
        "change_percent": 28.0,
        "change_numeric": 54000,
        "annual_openings": 20400,
        "median_wage": 108020,
        "entry_education": "bachelor",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "151221": {
        "title": "Computer and Information Research Scientists",
        "employment_2023": 39500,
        "employment_2033": 47100,
        "change_percent": 19.2,
        "change_numeric": 7600,
        "annual_openings": 4500,
        "median_wage": 145080,
        "entry_education": "master",
        "work_experience": "none",
        "on_job_training": "none"
    },

    # Construction and Extraction Occupations
    "472111": {
        "title": "Electricians",
        "employment_2023": 790400,
        "employment_2033": 854600,
        "change_percent": 8.1,
        "change_numeric": 64200,
        "annual_openings": 80500,
        "median_wage": 61590,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "apprenticeship"
    },
    "472152": {
        "title": "Plumbers, Pipefitters, and Steamfitters",
        "employment_2023": 507500,
        "employment_2033": 536500,
        "change_percent": 5.7,
        "change_numeric": 29000,
        "annual_openings": 47600,
        "median_wage": 63350,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "apprenticeship"
    },
    "472031": {
        "title": "Carpenters",
        "employment_2023": 1021100,
        "employment_2033": 1030900,
        "change_percent": 1.0,
        "change_numeric": 9800,
        "annual_openings": 82400,
        "median_wage": 58210,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "apprenticeship"
    },
    "499021": {
        "title": "Heating, Air Conditioning, and Refrigeration Mechanics and Installers",
        "employment_2023": 401900,
        "employment_2033": 424800,
        "change_percent": 5.7,
        "change_numeric": 22900,
        "annual_openings": 39100,
        "median_wage": 57300,
        "entry_education": "postsecondary",
        "work_experience": "none",
        "on_job_training": "long_term"
    },
    "474011": {
        "title": "Construction and Building Inspectors",
        "employment_2023": 136700,
        "employment_2033": 141100,
        "change_percent": 3.2,
        "change_numeric": 4400,
        "annual_openings": 13600,
        "median_wage": 67700,
        "entry_education": "hs_diploma",
        "work_experience": "5_years_plus",
        "on_job_training": "moderate"
    },
    "472051": {
        "title": "Cement Masons and Concrete Finishers",
        "employment_2023": 172100,
        "employment_2033": 181700,
        "change_percent": 5.6,
        "change_numeric": 9600,
        "annual_openings": 15800,
        "median_wage": 53110,
        "entry_education": "no_credential",
        "work_experience": "none",
        "on_job_training": "moderate"
    },
    "472181": {
        "title": "Roofers",
        "employment_2023": 154200,
        "employment_2033": 161000,
        "change_percent": 4.4,
        "change_numeric": 6800,
        "annual_openings": 15200,
        "median_wage": 51500,
        "entry_education": "no_credential",
        "work_experience": "none",
        "on_job_training": "moderate"
    },
    "472211": {
        "title": "Sheet Metal Workers",
        "employment_2023": 151500,
        "employment_2033": 152200,
        "change_percent": 0.5,
        "change_numeric": 700,
        "annual_openings": 11500,
        "median_wage": 60790,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "apprenticeship"
    },
    "472221": {
        "title": "Structural Iron and Steel Workers",
        "employment_2023": 82600,
        "employment_2033": 86600,
        "change_percent": 4.8,
        "change_numeric": 4000,
        "annual_openings": 8500,
        "median_wage": 63650,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "apprenticeship"
    },
    "471011": {
        "title": "First-Line Supervisors of Construction Trades and Extraction Workers",
        "employment_2023": 701800,
        "employment_2033": 731900,
        "change_percent": 4.3,
        "change_numeric": 30100,
        "annual_openings": 61700,
        "median_wage": 76140,
        "entry_education": "hs_diploma",
        "work_experience": "5_years_plus",
        "on_job_training": "none"
    },

    # Installation, Maintenance, and Repair Occupations
    "493023": {
        "title": "Automotive Service Technicians and Mechanics",
        "employment_2023": 747500,
        "employment_2033": 738500,
        "change_percent": -1.2,
        "change_numeric": -9000,
        "annual_openings": 69600,
        "median_wage": 47770,
        "entry_education": "postsecondary",
        "work_experience": "none",
        "on_job_training": "short_term"
    },
    "492022": {
        "title": "Telecommunications Equipment Installers and Repairers",
        "employment_2023": 185900,
        "employment_2033": 170200,
        "change_percent": -8.4,
        "change_numeric": -15700,
        "annual_openings": 15900,
        "median_wage": 60200,
        "entry_education": "postsecondary",
        "work_experience": "none",
        "on_job_training": "moderate"
    },
    "499041": {
        "title": "Industrial Machinery Mechanics",
        "employment_2023": 412600,
        "employment_2033": 477700,
        "change_percent": 15.8,
        "change_numeric": 65100,
        "annual_openings": 47400,
        "median_wage": 61530,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "long_term"
    },
    "493031": {
        "title": "Bus and Truck Mechanics and Diesel Engine Specialists",
        "employment_2023": 292700,
        "employment_2033": 309800,
        "change_percent": 5.8,
        "change_numeric": 17100,
        "annual_openings": 29400,
        "median_wage": 58210,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "long_term"
    },
    "499071": {
        "title": "Maintenance and Repair Workers, General",
        "employment_2023": 1447400,
        "employment_2033": 1504400,
        "change_percent": 3.9,
        "change_numeric": 57000,
        "annual_openings": 164600,
        "median_wage": 47140,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "moderate"
    },
    "492098": {
        "title": "Security and Fire Alarm Systems Installers",
        "employment_2023": 87500,
        "employment_2033": 97900,
        "change_percent": 11.9,
        "change_numeric": 10400,
        "annual_openings": 11500,
        "median_wage": 57320,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "moderate"
    },

    # Production Occupations
    "514121": {
        "title": "Welders, Cutters, Solderers, and Brazers",
        "employment_2023": 433200,
        "employment_2033": 450500,
        "change_percent": 4.0,
        "change_numeric": 17300,
        "annual_openings": 47900,
        "median_wage": 49500,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "moderate"
    },
    "514041": {
        "title": "Machinists",
        "employment_2023": 393900,
        "employment_2033": 373600,
        "change_percent": -5.2,
        "change_numeric": -20300,
        "annual_openings": 33500,
        "median_wage": 50840,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "long_term"
    },
    "517011": {
        "title": "Cabinetmakers and Bench Carpenters",
        "employment_2023": 95700,
        "employment_2033": 98500,
        "change_percent": 2.9,
        "change_numeric": 2800,
        "annual_openings": 9900,
        "median_wage": 43280,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "moderate"
    },
    "511011": {
        "title": "First-Line Supervisors of Production and Operating Workers",
        "employment_2023": 647900,
        "employment_2033": 646600,
        "change_percent": -0.2,
        "change_numeric": -1300,
        "annual_openings": 52200,
        "median_wage": 67330,
        "entry_education": "hs_diploma",
        "work_experience": "less_than_5",
        "on_job_training": "none"
    },
    "512092": {
        "title": "Team Assemblers",
        "employment_2023": 1060500,
        "employment_2033": 1040200,
        "change_percent": -1.9,
        "change_numeric": -20300,
        "annual_openings": 112100,
        "median_wage": 38270,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "moderate"
    },
    "519161": {
        "title": "Computer Numerically Controlled Tool Operators",
        "employment_2023": 157800,
        "employment_2033": 152800,
        "change_percent": -3.2,
        "change_numeric": -5000,
        "annual_openings": 17400,
        "median_wage": 47790,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "moderate"
    },
    "519162": {
        "title": "Computer Numerically Controlled Tool Programmers",
        "employment_2023": 24100,
        "employment_2033": 25700,
        "change_percent": 6.6,
        "change_numeric": 1600,
        "annual_openings": 2500,
        "median_wage": 63160,
        "entry_education": "postsecondary",
        "work_experience": "none",
        "on_job_training": "moderate"
    },

    # Business and Financial Occupations
    "132011": {
        "title": "Accountants and Auditors",
        "employment_2023": 1440700,
        "employment_2033": 1449100,
        "change_percent": 0.6,
        "change_numeric": 8400,
        "annual_openings": 130800,
        "median_wage": 79880,
        "entry_education": "bachelor",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "132052": {
        "title": "Personal Financial Advisors",
        "employment_2023": 363800,
        "employment_2033": 406400,
        "change_percent": 11.7,
        "change_numeric": 42600,
        "annual_openings": 29200,
        "median_wage": 99580,
        "entry_education": "bachelor",
        "work_experience": "none",
        "on_job_training": "long_term"
    },
    "131041": {
        "title": "Compliance Officers",
        "employment_2023": 357400,
        "employment_2033": 375100,
        "change_percent": 5.0,
        "change_numeric": 17700,
        "annual_openings": 29900,
        "median_wage": 75670,
        "entry_education": "bachelor",
        "work_experience": "none",
        "on_job_training": "moderate"
    },
    "131111": {
        "title": "Management Analysts",
        "employment_2023": 1035600,
        "employment_2033": 1158300,
        "change_percent": 11.8,
        "change_numeric": 122700,
        "annual_openings": 102200,
        "median_wage": 99410,
        "entry_education": "bachelor",
        "work_experience": "less_than_5",
        "on_job_training": "none"
    },
    "131161": {
        "title": "Market Research Analysts and Marketing Specialists",
        "employment_2023": 822500,
        "employment_2033": 916500,
        "change_percent": 11.4,
        "change_numeric": 94000,
        "annual_openings": 94200,
        "median_wage": 74680,
        "entry_education": "bachelor",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "131071": {
        "title": "Human Resources Specialists",
        "employment_2023": 816500,
        "employment_2033": 861700,
        "change_percent": 5.5,
        "change_numeric": 45200,
        "annual_openings": 80000,
        "median_wage": 67650,
        "entry_education": "bachelor",
        "work_experience": "none",
        "on_job_training": "none"
    },

    # Management Occupations
    "111021": {
        "title": "General and Operations Managers",
        "employment_2023": 3171400,
        "employment_2033": 3297400,
        "change_percent": 4.0,
        "change_numeric": 126000,
        "annual_openings": 326000,
        "median_wage": 101280,
        "entry_education": "bachelor",
        "work_experience": "5_years_plus",
        "on_job_training": "none"
    },
    "119013": {
        "title": "Farmers, Ranchers, and Other Agricultural Managers",
        "employment_2023": 897500,
        "employment_2033": 847600,
        "change_percent": -5.6,
        "change_numeric": -49900,
        "annual_openings": 73600,
        "median_wage": 80550,
        "entry_education": "hs_diploma",
        "work_experience": "5_years_plus",
        "on_job_training": "none"
    },
    "119111": {
        "title": "Medical and Health Services Managers",
        "employment_2023": 562200,
        "employment_2033": 661800,
        "change_percent": 17.7,
        "change_numeric": 99600,
        "annual_openings": 63000,
        "median_wage": 110680,
        "entry_education": "bachelor",
        "work_experience": "less_than_5",
        "on_job_training": "none"
    },
    "113021": {
        "title": "Computer and Information Systems Managers",
        "employment_2023": 570100,
        "employment_2033": 652000,
        "change_percent": 14.4,
        "change_numeric": 81900,
        "annual_openings": 52700,
        "median_wage": 169510,
        "entry_education": "bachelor",
        "work_experience": "5_years_plus",
        "on_job_training": "none"
    },
    "119041": {
        "title": "Architectural and Engineering Managers",
        "employment_2023": 211000,
        "employment_2033": 224000,
        "change_percent": 6.2,
        "change_numeric": 13000,
        "annual_openings": 15700,
        "median_wage": 165370,
        "entry_education": "bachelor",
        "work_experience": "5_years_plus",
        "on_job_training": "none"
    },

    # Office and Administrative Support Occupations
    "436013": {
        "title": "Medical Secretaries and Administrative Assistants",
        "employment_2023": 571800,
        "employment_2033": 605500,
        "change_percent": 5.9,
        "change_numeric": 33700,
        "annual_openings": 68500,
        "median_wage": 41240,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "moderate"
    },
    "434171": {
        "title": "Receptionists and Information Clerks",
        "employment_2023": 1015100,
        "employment_2033": 1027200,
        "change_percent": 1.2,
        "change_numeric": 12100,
        "annual_openings": 140500,
        "median_wage": 36800,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "short_term"
    },
    "433021": {
        "title": "Billing and Posting Clerks",
        "employment_2023": 460500,
        "employment_2033": 481700,
        "change_percent": 4.6,
        "change_numeric": 21200,
        "annual_openings": 55200,
        "median_wage": 45510,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "moderate"
    },
    "433031": {
        "title": "Bookkeeping, Accounting, and Auditing Clerks",
        "employment_2023": 1623700,
        "employment_2033": 1480400,
        "change_percent": -8.8,
        "change_numeric": -143300,
        "annual_openings": 155200,
        "median_wage": 47440,
        "entry_education": "some_college",
        "work_experience": "none",
        "on_job_training": "moderate"
    },
    "439041": {
        "title": "Insurance Claims and Policy Processing Clerks",
        "employment_2023": 261900,
        "employment_2033": 265700,
        "change_percent": 1.5,
        "change_numeric": 3800,
        "annual_openings": 34200,
        "median_wage": 48040,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "moderate"
    },

    # Legal Occupations
    "232011": {
        "title": "Paralegals and Legal Assistants",
        "employment_2023": 361500,
        "employment_2033": 404500,
        "change_percent": 11.9,
        "change_numeric": 43000,
        "annual_openings": 48700,
        "median_wage": 60970,
        "entry_education": "associate",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "232093": {
        "title": "Title Examiners, Abstractors, and Searchers",
        "employment_2023": 59400,
        "employment_2033": 60800,
        "change_percent": 2.4,
        "change_numeric": 1400,
        "annual_openings": 6200,
        "median_wage": 54630,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "moderate"
    },

    # Education, Training, and Library Occupations
    "251000": {
        "title": "Postsecondary Teachers",
        "employment_2023": 1321900,
        "employment_2033": 1410300,
        "change_percent": 6.7,
        "change_numeric": 88400,
        "annual_openings": 121500,
        "median_wage": 84380,
        "entry_education": "doctoral",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "252021": {
        "title": "Elementary School Teachers, Except Special Education",
        "employment_2023": 1432100,
        "employment_2033": 1451700,
        "change_percent": 1.4,
        "change_numeric": 19600,
        "annual_openings": 102300,
        "median_wage": 63670,
        "entry_education": "bachelor",
        "work_experience": "none",
        "on_job_training": "internship"
    },
    "252031": {
        "title": "Secondary School Teachers, Except Special and Career/Technical Education",
        "employment_2023": 1021700,
        "employment_2033": 1022300,
        "change_percent": 0.1,
        "change_numeric": 600,
        "annual_openings": 73400,
        "median_wage": 65220,
        "entry_education": "bachelor",
        "work_experience": "none",
        "on_job_training": "internship"
    },
    "253021": {
        "title": "Self-Enrichment Teachers",
        "employment_2023": 337100,
        "employment_2033": 378900,
        "change_percent": 12.4,
        "change_numeric": 41800,
        "annual_openings": 55600,
        "median_wage": 46410,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "259031": {
        "title": "Instructional Coordinators",
        "employment_2023": 214200,
        "employment_2033": 228600,
        "change_percent": 6.7,
        "change_numeric": 14400,
        "annual_openings": 19500,
        "median_wage": 66490,
        "entry_education": "master",
        "work_experience": "5_years_plus",
        "on_job_training": "none"
    },

    # Food Preparation and Serving Occupations
    "351012": {
        "title": "First-Line Supervisors of Food Preparation and Serving Workers",
        "employment_2023": 1239800,
        "employment_2033": 1359400,
        "change_percent": 9.6,
        "change_numeric": 119600,
        "annual_openings": 210400,
        "median_wage": 40380,
        "entry_education": "hs_diploma",
        "work_experience": "less_than_5",
        "on_job_training": "none"
    },
    "351011": {
        "title": "Chefs and Head Cooks",
        "employment_2023": 158500,
        "employment_2033": 178200,
        "change_percent": 12.4,
        "change_numeric": 19700,
        "annual_openings": 22900,
        "median_wage": 58920,
        "entry_education": "hs_diploma",
        "work_experience": "less_than_5",
        "on_job_training": "none"
    },
    "352014": {
        "title": "Cooks, Restaurant",
        "employment_2023": 1484100,
        "employment_2033": 1636300,
        "change_percent": 10.3,
        "change_numeric": 152200,
        "annual_openings": 267900,
        "median_wage": 35620,
        "entry_education": "no_credential",
        "work_experience": "none",
        "on_job_training": "moderate"
    },
    "353031": {
        "title": "Waiters and Waitresses",
        "employment_2023": 2161200,
        "employment_2033": 2250700,
        "change_percent": 4.1,
        "change_numeric": 89500,
        "annual_openings": 437200,
        "median_wage": 31780,
        "entry_education": "no_credential",
        "work_experience": "none",
        "on_job_training": "short_term"
    },
    "353011": {
        "title": "Bartenders",
        "employment_2023": 692700,
        "employment_2033": 752400,
        "change_percent": 8.6,
        "change_numeric": 59700,
        "annual_openings": 126400,
        "median_wage": 32030,
        "entry_education": "no_credential",
        "work_experience": "none",
        "on_job_training": "short_term"
    },

    # Protective Service Occupations
    "339032": {
        "title": "Security Guards",
        "employment_2023": 1134300,
        "employment_2033": 1186700,
        "change_percent": 4.6,
        "change_numeric": 52400,
        "annual_openings": 167700,
        "median_wage": 36680,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "short_term"
    },
    "332011": {
        "title": "Firefighters",
        "employment_2023": 328700,
        "employment_2033": 342900,
        "change_percent": 4.3,
        "change_numeric": 14200,
        "annual_openings": 27000,
        "median_wage": 57120,
        "entry_education": "postsecondary",
        "work_experience": "none",
        "on_job_training": "long_term"
    },
    "333051": {
        "title": "Police and Sheriff's Patrol Officers",
        "employment_2023": 671500,
        "employment_2033": 680900,
        "change_percent": 1.4,
        "change_numeric": 9400,
        "annual_openings": 49200,
        "median_wage": 74910,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "moderate"
    },
    "331011": {
        "title": "First-Line Supervisors of Correctional Officers",
        "employment_2023": 48300,
        "employment_2033": 47500,
        "change_percent": -1.7,
        "change_numeric": -800,
        "annual_openings": 4000,
        "median_wage": 69580,
        "entry_education": "hs_diploma",
        "work_experience": "less_than_5",
        "on_job_training": "moderate"
    },

    # Transportation and Material Moving Occupations
    "533032": {
        "title": "Heavy and Tractor-Trailer Truck Drivers",
        "employment_2023": 2133100,
        "employment_2033": 2148200,
        "change_percent": 0.7,
        "change_numeric": 15100,
        "annual_openings": 239900,
        "median_wage": 54320,
        "entry_education": "postsecondary",
        "work_experience": "none",
        "on_job_training": "short_term"
    },
    "533033": {
        "title": "Light Truck Drivers",
        "employment_2023": 1002900,
        "employment_2033": 1059100,
        "change_percent": 5.6,
        "change_numeric": 56200,
        "annual_openings": 161700,
        "median_wage": 40410,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "short_term"
    },
    "534011": {
        "title": "Aircraft Pilots, Copilots, and Flight Engineers",
        "employment_2023": 155900,
        "employment_2033": 167900,
        "change_percent": 7.7,
        "change_numeric": 12000,
        "annual_openings": 18000,
        "median_wage": 211790,
        "entry_education": "bachelor",
        "work_experience": "none",
        "on_job_training": "moderate"
    },
    "537062": {
        "title": "Laborers and Freight, Stock, and Material Movers, Hand",
        "employment_2023": 3104900,
        "employment_2033": 3162500,
        "change_percent": 1.9,
        "change_numeric": 57600,
        "annual_openings": 520100,
        "median_wage": 36750,
        "entry_education": "no_credential",
        "work_experience": "none",
        "on_job_training": "short_term"
    },
    "537051": {
        "title": "Industrial Truck and Tractor Operators",
        "employment_2023": 773100,
        "employment_2033": 779600,
        "change_percent": 0.8,
        "change_numeric": 6500,
        "annual_openings": 108500,
        "median_wage": 42660,
        "entry_education": "no_credential",
        "work_experience": "none",
        "on_job_training": "short_term"
    },

    # Sales and Related Occupations
    "412031": {
        "title": "Retail Salespersons",
        "employment_2023": 4055100,
        "employment_2033": 3885900,
        "change_percent": -4.2,
        "change_numeric": -169200,
        "annual_openings": 558000,
        "median_wage": 33680,
        "entry_education": "no_credential",
        "work_experience": "none",
        "on_job_training": "short_term"
    },
    "412022": {
        "title": "Parts Salespersons",
        "employment_2023": 279600,
        "employment_2033": 270700,
        "change_percent": -3.2,
        "change_numeric": -8900,
        "annual_openings": 33200,
        "median_wage": 37410,
        "entry_education": "no_credential",
        "work_experience": "none",
        "on_job_training": "moderate"
    },
    "413011": {
        "title": "Advertising Sales Agents",
        "employment_2023": 119100,
        "employment_2033": 108900,
        "change_percent": -8.6,
        "change_numeric": -10200,
        "annual_openings": 12400,
        "median_wage": 61270,
        "entry_education": "bachelor",
        "work_experience": "none",
        "on_job_training": "moderate"
    },
    "413031": {
        "title": "Securities, Commodities, and Financial Services Sales Agents",
        "employment_2023": 472600,
        "employment_2033": 537500,
        "change_percent": 13.7,
        "change_numeric": 64900,
        "annual_openings": 46500,
        "median_wage": 76900,
        "entry_education": "bachelor",
        "work_experience": "none",
        "on_job_training": "moderate"
    },
    "419022": {
        "title": "Real Estate Sales Agents",
        "employment_2023": 487400,
        "employment_2033": 510200,
        "change_percent": 4.7,
        "change_numeric": 22800,
        "annual_openings": 51900,
        "median_wage": 56620,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "moderate"
    },

    # Arts, Design, Entertainment, Sports, and Media Occupations
    "271024": {
        "title": "Graphic Designers",
        "employment_2023": 264800,
        "employment_2033": 261500,
        "change_percent": -1.2,
        "change_numeric": -3300,
        "annual_openings": 23700,
        "median_wage": 60070,
        "entry_education": "bachelor",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "272012": {
        "title": "Producers and Directors",
        "employment_2023": 140200,
        "employment_2033": 151900,
        "change_percent": 8.4,
        "change_numeric": 11700,
        "annual_openings": 14200,
        "median_wage": 82510,
        "entry_education": "bachelor",
        "work_experience": "less_than_5",
        "on_job_training": "none"
    },
    "273031": {
        "title": "Public Relations Specialists",
        "employment_2023": 308100,
        "employment_2033": 330200,
        "change_percent": 7.2,
        "change_numeric": 22100,
        "annual_openings": 30700,
        "median_wage": 66750,
        "entry_education": "bachelor",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "274021": {
        "title": "Photographers",
        "employment_2023": 68400,
        "employment_2033": 65500,
        "change_percent": -4.2,
        "change_numeric": -2900,
        "annual_openings": 8500,
        "median_wage": 45420,
        "entry_education": "hs_diploma",
        "work_experience": "none",
        "on_job_training": "long_term"
    },

    # Personal Care and Service Occupations
    "395012": {
        "title": "Hairdressers, Hairstylists, and Cosmetologists",
        "employment_2023": 716100,
        "employment_2033": 748900,
        "change_percent": 4.6,
        "change_numeric": 32800,
        "annual_openings": 81700,
        "median_wage": 35560,
        "entry_education": "postsecondary",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "395092": {
        "title": "Manicurists and Pedicurists",
        "employment_2023": 171600,
        "employment_2033": 189100,
        "change_percent": 10.2,
        "change_numeric": 17500,
        "annual_openings": 22800,
        "median_wage": 35670,
        "entry_education": "postsecondary",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "395094": {
        "title": "Skincare Specialists",
        "employment_2023": 83000,
        "employment_2033": 93700,
        "change_percent": 12.9,
        "change_numeric": 10700,
        "annual_openings": 12400,
        "median_wage": 43010,
        "entry_education": "postsecondary",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "393091": {
        "title": "Amusement and Recreation Attendants",
        "employment_2023": 336400,
        "employment_2033": 365300,
        "change_percent": 8.6,
        "change_numeric": 28900,
        "annual_openings": 78500,
        "median_wage": 30150,
        "entry_education": "no_credential",
        "work_experience": "none",
        "on_job_training": "short_term"
    },

    # Architecture and Engineering Occupations
    "172051": {
        "title": "Civil Engineers",
        "employment_2023": 327600,
        "employment_2033": 346900,
        "change_percent": 5.9,
        "change_numeric": 19300,
        "annual_openings": 23200,
        "median_wage": 95890,
        "entry_education": "bachelor",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "172071": {
        "title": "Electrical Engineers",
        "employment_2023": 203600,
        "employment_2033": 212900,
        "change_percent": 4.6,
        "change_numeric": 9300,
        "annual_openings": 14900,
        "median_wage": 109560,
        "entry_education": "bachelor",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "172141": {
        "title": "Mechanical Engineers",
        "employment_2023": 296500,
        "employment_2033": 304500,
        "change_percent": 2.7,
        "change_numeric": 8000,
        "annual_openings": 19200,
        "median_wage": 99510,
        "entry_education": "bachelor",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "173023": {
        "title": "Electrical and Electronic Engineering Technologists and Technicians",
        "employment_2023": 120400,
        "employment_2033": 118900,
        "change_percent": -1.2,
        "change_numeric": -1500,
        "annual_openings": 9500,
        "median_wage": 69700,
        "entry_education": "associate",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "173022": {
        "title": "Civil Engineering Technologists and Technicians",
        "employment_2023": 72100,
        "employment_2033": 73500,
        "change_percent": 1.9,
        "change_numeric": 1400,
        "annual_openings": 5800,
        "median_wage": 60220,
        "entry_education": "associate",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "173026": {
        "title": "Industrial Engineering Technologists and Technicians",
        "employment_2023": 72900,
        "employment_2033": 74700,
        "change_percent": 2.5,
        "change_numeric": 1800,
        "annual_openings": 6200,
        "median_wage": 60610,
        "entry_education": "associate",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "173027": {
        "title": "Mechanical Engineering Technologists and Technicians",
        "employment_2023": 41600,
        "employment_2033": 42300,
        "change_percent": 1.7,
        "change_numeric": 700,
        "annual_openings": 3200,
        "median_wage": 62100,
        "entry_education": "associate",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "172112": {
        "title": "Industrial Engineers",
        "employment_2023": 346000,
        "employment_2033": 372300,
        "change_percent": 7.6,
        "change_numeric": 26300,
        "annual_openings": 24200,
        "median_wage": 99380,
        "entry_education": "bachelor",
        "work_experience": "none",
        "on_job_training": "none"
    },

    # Life, Physical, and Social Science Occupations
    "194031": {
        "title": "Chemical Technicians",
        "employment_2023": 62100,
        "employment_2033": 63800,
        "change_percent": 2.7,
        "change_numeric": 1700,
        "annual_openings": 6000,
        "median_wage": 56540,
        "entry_education": "associate",
        "work_experience": "none",
        "on_job_training": "moderate"
    },
    "194021": {
        "title": "Biological Technicians",
        "employment_2023": 87900,
        "employment_2033": 92400,
        "change_percent": 5.1,
        "change_numeric": 4500,
        "annual_openings": 9300,
        "median_wage": 50360,
        "entry_education": "bachelor",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "191013": {
        "title": "Soil and Plant Scientists",
        "employment_2023": 17800,
        "employment_2033": 18500,
        "change_percent": 3.9,
        "change_numeric": 700,
        "annual_openings": 1600,
        "median_wage": 63260,
        "entry_education": "bachelor",
        "work_experience": "none",
        "on_job_training": "none"
    },
    "192041": {
        "title": "Environmental Scientists and Specialists",
        "employment_2023": 94400,
        "employment_2033": 100200,
        "change_percent": 6.1,
        "change_numeric": 5800,
        "annual_openings": 7500,
        "median_wage": 78980,
        "entry_education": "bachelor",
        "work_experience": "none",
        "on_job_training": "none"
    },
}


def get_projection(soc_code: str) -> Optional[OccupationProjection]:
    """
    Get projection data for a specific SOC code.

    Args:
        soc_code: SOC code (e.g., "291141" or "29-1141")

    Returns:
        OccupationProjection or None if not found
    """
    # Normalize SOC code (remove hyphen if present)
    normalized_code = soc_code.replace("-", "")

    data = OCCUPATION_PROJECTIONS.get(normalized_code)
    if not data:
        return None

    # Get outlook category
    outlook, outlook_label = get_outlook(data["change_percent"])

    # Get labels for education/experience/training
    entry_edu_label = EDUCATION_LEVELS.get(data["entry_education"], data["entry_education"])
    work_exp_label = EXPERIENCE_LEVELS.get(data["work_experience"], data["work_experience"])
    training_label = TRAINING_LEVELS.get(data["on_job_training"], data["on_job_training"])

    return OccupationProjection(
        soc_code=normalized_code,
        title=data["title"],
        employment_2023=data["employment_2023"],
        employment_2033=data["employment_2033"],
        change_percent=data["change_percent"],
        change_numeric=data["change_numeric"],
        annual_openings=data["annual_openings"],
        median_wage=data.get("median_wage"),
        entry_education=data["entry_education"],
        entry_education_label=entry_edu_label,
        work_experience=data["work_experience"],
        work_experience_label=work_exp_label,
        on_job_training=data["on_job_training"],
        on_job_training_label=training_label,
        outlook=outlook,
        outlook_label=outlook_label,
    )


def search_projections(query: str, limit: int = 20) -> List[OccupationProjection]:
    """
    Search projections by occupation title or SOC code.

    Args:
        query: Search query (title or SOC code)
        limit: Maximum results to return

    Returns:
        List of matching OccupationProjection objects
    """
    query_lower = query.lower().strip()
    results = []

    for soc_code, data in OCCUPATION_PROJECTIONS.items():
        # Check if query matches SOC code or title
        if query_lower in soc_code or query_lower in data["title"].lower():
            projection = get_projection(soc_code)
            if projection:
                results.append(projection)

        if len(results) >= limit:
            break

    return results


def get_all_projections() -> List[OccupationProjection]:
    """Get all available occupation projections."""
    return [get_projection(code) for code in OCCUPATION_PROJECTIONS.keys() if get_projection(code)]


def get_available_soc_codes() -> List[str]:
    """Get list of SOC codes that have projection data available."""
    return list(OCCUPATION_PROJECTIONS.keys())
