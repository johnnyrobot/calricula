"""
PDF Generator Service for LMI Reports

Generates professional PDF reports for Labor Market Information data
suitable for inclusion in CTE program proposals.
"""

import io
from datetime import datetime
from typing import Any, Dict, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT


class LMIPDFGenerator:
    """
    Generates PDF reports for Labor Market Information data.
    """

    # Color scheme (Luminous design system inspired)
    PRIMARY_COLOR = colors.HexColor("#6366f1")  # Indigo/luminous-500
    SECONDARY_COLOR = colors.HexColor("#4f46e5")  # luminous-600
    TEXT_COLOR = colors.HexColor("#1e293b")  # Slate-800
    LIGHT_TEXT = colors.HexColor("#64748b")  # Slate-500
    SUCCESS_COLOR = colors.HexColor("#10b981")  # Emerald-500
    WARNING_COLOR = colors.HexColor("#f59e0b")  # Amber-500
    BORDER_COLOR = colors.HexColor("#e2e8f0")  # Slate-200

    def __init__(self):
        self.styles = getSampleStyleSheet()
        self._setup_custom_styles()

    def _setup_custom_styles(self):
        """Set up custom paragraph styles for the report."""
        # Title style
        self.styles.add(ParagraphStyle(
            name='ReportTitle',
            parent=self.styles['Heading1'],
            fontSize=18,
            textColor=self.PRIMARY_COLOR,
            spaceAfter=6,
            alignment=TA_CENTER,
        ))

        # Subtitle style
        self.styles.add(ParagraphStyle(
            name='ReportSubtitle',
            parent=self.styles['Normal'],
            fontSize=11,
            textColor=self.LIGHT_TEXT,
            spaceAfter=20,
            alignment=TA_CENTER,
        ))

        # Section header style
        self.styles.add(ParagraphStyle(
            name='SectionHeader',
            parent=self.styles['Heading2'],
            fontSize=12,
            textColor=self.SECONDARY_COLOR,
            spaceBefore=16,
            spaceAfter=8,
            borderPadding=(0, 0, 4, 0),
        ))

        # Body text style (using custom name to avoid conflict)
        self.styles.add(ParagraphStyle(
            name='LMIBodyText',
            parent=self.styles['Normal'],
            fontSize=10,
            textColor=self.TEXT_COLOR,
            leading=14,
        ))

        # Footer style
        self.styles.add(ParagraphStyle(
            name='Footer',
            parent=self.styles['Normal'],
            fontSize=8,
            textColor=self.LIGHT_TEXT,
            alignment=TA_CENTER,
        ))

    def _format_currency(self, value: Optional[float], hourly: bool = False) -> str:
        """Format a currency value."""
        if value is None:
            return "—"
        if hourly:
            return f"${value:.2f}"
        return f"${value:,.0f}"

    def _format_number(self, value: Optional[float]) -> str:
        """Format a number with commas."""
        if value is None:
            return "—"
        return f"{value:,.0f}"

    def _format_percent(self, value: Optional[float]) -> str:
        """Format a percentage."""
        if value is None:
            return "—"
        sign = "+" if value >= 0 else ""
        return f"{sign}{value:.1f}%"

    def generate_lmi_report(
        self,
        course_code: str,
        course_title: str,
        lmi_data: Dict[str, Any],
    ) -> bytes:
        """
        Generate a PDF report for LMI data.

        Args:
            course_code: The course code (e.g., "NURS 101")
            course_title: The course title
            lmi_data: Dictionary containing LMI data with keys:
                - soc_code: SOC code
                - occupation_title: Occupation title
                - area: Geographic area
                - retrieved_at: Data retrieval timestamp
                - wage_data: Wage information
                - projection_data: Employment projections
                - narrative: Optional narrative text

        Returns:
            PDF file as bytes
        """
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            rightMargin=0.75 * inch,
            leftMargin=0.75 * inch,
            topMargin=0.75 * inch,
            bottomMargin=0.75 * inch,
        )

        # Build the document elements
        elements = []

        # Header
        elements.extend(self._build_header(course_code, course_title, lmi_data))

        # Target Occupation Section
        elements.extend(self._build_occupation_section(lmi_data))

        # Wage Data Section
        wage_data = lmi_data.get("wage_data") or lmi_data.get("lmi_wage_data")
        if wage_data:
            elements.extend(self._build_wage_section(wage_data))

        # Employment Projections Section
        projection_data = lmi_data.get("projection_data") or lmi_data.get("lmi_projection_data")
        if projection_data:
            elements.extend(self._build_projections_section(projection_data))

        # Narrative Section
        narrative = lmi_data.get("narrative") or lmi_data.get("lmi_narrative")
        if narrative:
            elements.extend(self._build_narrative_section(narrative))

        # Footer
        elements.extend(self._build_footer(lmi_data))

        # Build the PDF
        doc.build(elements)
        buffer.seek(0)
        return buffer.getvalue()

    def _build_header(
        self,
        course_code: str,
        course_title: str,
        lmi_data: Dict[str, Any],
    ) -> list:
        """Build the report header section."""
        elements = []

        # Title
        elements.append(Paragraph(
            "LABOR MARKET INFORMATION REPORT",
            self.styles['ReportTitle']
        ))

        # Course info
        elements.append(Paragraph(
            f"Course: {course_code} - {course_title}",
            self.styles['ReportSubtitle']
        ))

        # Dates
        generated_date = datetime.now().strftime("%B %d, %Y")
        retrieved_at = lmi_data.get("retrieved_at") or lmi_data.get("lmi_retrieved_at")
        if retrieved_at:
            if isinstance(retrieved_at, str):
                try:
                    retrieved_date = datetime.fromisoformat(retrieved_at.replace('Z', '+00:00'))
                    retrieved_str = retrieved_date.strftime("%B %d, %Y")
                except:
                    retrieved_str = retrieved_at
            else:
                retrieved_str = retrieved_at.strftime("%B %d, %Y")
        else:
            retrieved_str = "Not specified"

        date_info = f"Generated: {generated_date} | Data Retrieved: {retrieved_str}"
        elements.append(Paragraph(date_info, self.styles['Footer']))
        elements.append(Spacer(1, 20))

        # Horizontal rule
        elements.append(HRFlowable(
            width="100%",
            thickness=1,
            color=self.PRIMARY_COLOR,
            spaceBefore=0,
            spaceAfter=10,
        ))

        return elements

    def _build_occupation_section(self, lmi_data: Dict[str, Any]) -> list:
        """Build the target occupation section."""
        elements = []

        elements.append(Paragraph("TARGET OCCUPATION", self.styles['SectionHeader']))

        soc_code = lmi_data.get("soc_code") or lmi_data.get("lmi_soc_code") or "N/A"
        occupation_title = lmi_data.get("occupation_title") or lmi_data.get("lmi_occupation_title") or "Not specified"

        # Try to get area from multiple sources
        area = lmi_data.get("area")
        if not area and lmi_data.get("wage_data"):
            area = lmi_data.get("wage_data", {}).get("area")
        if not area and lmi_data.get("lmi_wage_data"):
            area = lmi_data.get("lmi_wage_data", {}).get("area")
        area = area or "Not specified"

        # Create occupation info table
        data = [
            ["SOC Code:", soc_code],
            ["Occupation Title:", occupation_title],
            ["Geographic Area:", area],
        ]

        table = Table(data, colWidths=[1.5 * inch, 5 * inch])
        table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TEXTCOLOR', (0, 0), (0, -1), self.LIGHT_TEXT),
            ('TEXTCOLOR', (1, 0), (1, -1), self.TEXT_COLOR),
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(table)
        elements.append(Spacer(1, 10))

        return elements

    def _build_wage_section(self, wage_data: Dict[str, Any]) -> list:
        """Build the wage data section."""
        elements = []

        year = wage_data.get("year", "")
        header = f"WAGE DATA ({year})" if year else "WAGE DATA"
        elements.append(Paragraph(header, self.styles['SectionHeader']))

        # Key metrics row
        median_hourly = self._format_currency(wage_data.get("hourly_median"), hourly=True)
        median_annual = self._format_currency(wage_data.get("annual_median"))
        employment = self._format_number(wage_data.get("employment"))

        key_metrics = [
            ["Median Hourly", "Median Annual", "Employment"],
            [median_hourly, median_annual, employment],
        ]

        metrics_table = Table(key_metrics, colWidths=[2.2 * inch, 2.2 * inch, 2.2 * inch])
        metrics_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica'),
            ('FONTNAME', (0, 1), (-1, 1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('FONTSIZE', (0, 1), (-1, 1), 14),
            ('TEXTCOLOR', (0, 0), (-1, 0), self.LIGHT_TEXT),
            ('TEXTCOLOR', (0, 1), (-1, 1), self.SUCCESS_COLOR),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#f0fdf4")),  # Emerald-50
            ('BOX', (0, 0), (-1, -1), 1, self.BORDER_COLOR),
        ]))
        elements.append(metrics_table)
        elements.append(Spacer(1, 12))

        # Wage percentiles table
        percentiles_data = [
            ["Percentile", "Hourly Wage"],
            ["10th Percentile", self._format_currency(wage_data.get("hourly_10th"), hourly=True)],
            ["25th Percentile", self._format_currency(wage_data.get("hourly_25th"), hourly=True)],
            ["50th Percentile (Median)", self._format_currency(wage_data.get("hourly_median"), hourly=True)],
            ["75th Percentile", self._format_currency(wage_data.get("hourly_75th"), hourly=True)],
            ["90th Percentile", self._format_currency(wage_data.get("hourly_90th"), hourly=True)],
        ]

        percentiles_table = Table(percentiles_data, colWidths=[3.5 * inch, 3 * inch])
        percentiles_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TEXTCOLOR', (0, 0), (-1, -1), self.TEXT_COLOR),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BACKGROUND', (0, 0), (-1, 0), self.PRIMARY_COLOR),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('LINEBELOW', (0, 0), (-1, -2), 0.5, self.BORDER_COLOR),
            ('BOX', (0, 0), (-1, -1), 1, self.BORDER_COLOR),
            # Highlight median row
            ('BACKGROUND', (0, 3), (-1, 3), colors.HexColor("#f1f5f9")),  # Slate-100
            ('FONTNAME', (0, 3), (-1, 3), 'Helvetica-Bold'),
        ]))
        elements.append(percentiles_table)
        elements.append(Spacer(1, 10))

        return elements

    def _build_projections_section(self, projection_data: Dict[str, Any]) -> list:
        """Build the employment projections section."""
        elements = []

        period = projection_data.get("period", "")
        header = f"EMPLOYMENT PROJECTIONS ({period})" if period else "EMPLOYMENT PROJECTIONS"
        elements.append(Paragraph(header, self.styles['SectionHeader']))

        # Key metrics
        growth_rate = self._format_percent(projection_data.get("percent_change"))
        total_openings = self._format_number(projection_data.get("total_openings"))

        # Determine growth color
        growth_val = projection_data.get("percent_change", 0)
        growth_color = self.SUCCESS_COLOR if (growth_val or 0) >= 0 else colors.HexColor("#ef4444")

        key_metrics = [
            ["Growth Rate", "Annual Openings"],
            [growth_rate, total_openings],
        ]

        metrics_table = Table(key_metrics, colWidths=[3.3 * inch, 3.3 * inch])
        metrics_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica'),
            ('FONTNAME', (0, 1), (-1, 1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('FONTSIZE', (0, 1), (-1, 1), 14),
            ('TEXTCOLOR', (0, 0), (-1, 0), self.LIGHT_TEXT),
            ('TEXTCOLOR', (0, 1), (0, 1), growth_color),
            ('TEXTCOLOR', (1, 1), (1, 1), self.PRIMARY_COLOR),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#eff6ff")),  # Blue-50
            ('BOX', (0, 0), (-1, -1), 1, self.BORDER_COLOR),
        ]))
        elements.append(metrics_table)
        elements.append(Spacer(1, 12))

        # Employment forecast details
        forecast_data = [
            ["Employment Forecast", ""],
        ]

        base_year = projection_data.get("base_year", "Base")
        proj_year = projection_data.get("proj_year", "Projected")
        emp_base = projection_data.get("emp_base")
        emp_proj = projection_data.get("emp_proj")
        numeric_change = projection_data.get("numeric_change")

        if emp_base:
            forecast_data.append([f"Base Year ({base_year})", self._format_number(emp_base)])
        if emp_proj:
            forecast_data.append([f"Projected Year ({proj_year})", self._format_number(emp_proj)])
        if numeric_change is not None:
            sign = "+" if numeric_change >= 0 else ""
            forecast_data.append(["Numeric Change", f"{sign}{self._format_number(numeric_change)}"])

        if len(forecast_data) > 1:
            forecast_table = Table(forecast_data, colWidths=[3.5 * inch, 3 * inch])
            forecast_table.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('TEXTCOLOR', (0, 0), (-1, -1), self.TEXT_COLOR),
                ('ALIGN', (0, 0), (0, -1), 'LEFT'),
                ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('SPAN', (0, 0), (1, 0)),
                ('BACKGROUND', (0, 0), (-1, 0), self.PRIMARY_COLOR),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('LINEBELOW', (0, 0), (-1, -2), 0.5, self.BORDER_COLOR),
                ('BOX', (0, 0), (-1, -1), 1, self.BORDER_COLOR),
            ]))
            elements.append(forecast_table)
            elements.append(Spacer(1, 12))

        # Entry requirements
        education = projection_data.get("entry_level_education")
        experience = projection_data.get("work_experience")
        training = projection_data.get("job_training")

        if education or experience or training:
            req_data = [["Entry Requirements", ""]]
            if education:
                req_data.append(["Education", education])
            if experience:
                req_data.append(["Work Experience", experience])
            if training:
                req_data.append(["Job Training", training])

            req_table = Table(req_data, colWidths=[2 * inch, 4.5 * inch])
            req_table.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
                ('FONTNAME', (1, 1), (1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('TEXTCOLOR', (0, 0), (-1, -1), self.TEXT_COLOR),
                ('TEXTCOLOR', (0, 1), (0, -1), self.LIGHT_TEXT),
                ('ALIGN', (0, 0), (0, -1), 'LEFT'),
                ('ALIGN', (1, 0), (1, -1), 'LEFT'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('SPAN', (0, 0), (1, 0)),
                ('BACKGROUND', (0, 0), (-1, 0), self.SECONDARY_COLOR),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('LINEBELOW', (0, 0), (-1, -2), 0.5, self.BORDER_COLOR),
                ('BOX', (0, 0), (-1, -1), 1, self.BORDER_COLOR),
            ]))
            elements.append(req_table)
            elements.append(Spacer(1, 10))

        return elements

    def _build_narrative_section(self, narrative: str) -> list:
        """Build the narrative section."""
        elements = []

        elements.append(Paragraph("LABOR MARKET NARRATIVE", self.styles['SectionHeader']))

        # Clean and format the narrative
        narrative_text = narrative.strip()
        elements.append(Paragraph(narrative_text, self.styles['LMIBodyText']))
        elements.append(Spacer(1, 10))

        return elements

    def _build_footer(self, lmi_data: Dict[str, Any]) -> list:
        """Build the report footer."""
        elements = []

        elements.append(Spacer(1, 20))
        elements.append(HRFlowable(
            width="100%",
            thickness=0.5,
            color=self.BORDER_COLOR,
            spaceBefore=0,
            spaceAfter=10,
        ))

        # Data source attribution
        elements.append(Paragraph(
            "Data Source: California Employment Development Department (EDD) via CKAN API",
            self.styles['Footer']
        ))

        return elements


# Singleton instance for easy import
lmi_pdf_generator = LMIPDFGenerator()


def generate_lmi_pdf(
    course_code: str,
    course_title: str,
    lmi_data: Dict[str, Any],
) -> bytes:
    """
    Convenience function to generate an LMI PDF report.

    Args:
        course_code: The course code (e.g., "NURS 101")
        course_title: The course title
        lmi_data: Dictionary containing LMI data

    Returns:
        PDF file as bytes
    """
    return lmi_pdf_generator.generate_lmi_report(course_code, course_title, lmi_data)
