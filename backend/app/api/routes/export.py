"""
Export API Routes

Provides endpoints for exporting Course Outlines of Record (CORs) and Programs:
- PDF export for printing and archival
- JSON export for eLumen integration
"""

import uuid
import io
from datetime import datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable

from app.core.database import get_session
from app.core.deps import get_current_user
from app.models.user import User
from app.models.course import (
    Course,
    CourseStatus,
    StudentLearningOutcome,
    CourseContent,
    CourseRequisite,
)
from app.models.department import Department
from app.models.program import (
    Program,
    ProgramStatus,
    ProgramType,
    ProgramCourse,
    RequirementType,
)

router = APIRouter()


# =============================================================================
# PDF Styles
# =============================================================================

def get_pdf_styles():
    """Get custom PDF styles for COR export."""
    styles = getSampleStyleSheet()

    # Title style
    styles.add(ParagraphStyle(
        name='CORTitle',
        parent=styles['Heading1'],
        fontSize=18,
        spaceAfter=12,
        textColor=colors.HexColor('#4f46e5'),  # luminous-600
    ))

    # Section header style
    styles.add(ParagraphStyle(
        name='SectionHeader',
        parent=styles['Heading2'],
        fontSize=14,
        spaceBefore=16,
        spaceAfter=8,
        textColor=colors.HexColor('#1e1b4b'),  # luminous-950
    ))

    # Subsection header style
    styles.add(ParagraphStyle(
        name='SubsectionHeader',
        parent=styles['Heading3'],
        fontSize=12,
        spaceBefore=10,
        spaceAfter=6,
        textColor=colors.HexColor('#312e81'),  # luminous-900
    ))

    # Body text style
    styles.add(ParagraphStyle(
        name='CORBody',
        parent=styles['Normal'],
        fontSize=10,
        spaceBefore=4,
        spaceAfter=4,
        leading=14,
    ))

    # List item style
    styles.add(ParagraphStyle(
        name='CORListItem',
        parent=styles['Normal'],
        fontSize=10,
        leftIndent=20,
        spaceBefore=2,
        spaceAfter=2,
        leading=14,
    ))

    # Footer style
    styles.add(ParagraphStyle(
        name='Footer',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.gray,
        alignment=1,  # Center
    ))

    return styles


def format_status(status: CourseStatus) -> str:
    """Format course status for display."""
    status_map = {
        CourseStatus.DRAFT: "Draft",
        CourseStatus.DEPT_REVIEW: "Department Review",
        CourseStatus.CURRICULUM_COMMITTEE: "Curriculum Committee Review",
        CourseStatus.ARTICULATION_REVIEW: "Articulation Review",
        CourseStatus.APPROVED: "Approved",
    }
    return status_map.get(status, str(status))


def format_bloom_level(level: str) -> str:
    """Format Bloom's taxonomy level for display."""
    level_map = {
        "REMEMBER": "Remember (Level 1)",
        "UNDERSTAND": "Understand (Level 2)",
        "APPLY": "Apply (Level 3)",
        "ANALYZE": "Analyze (Level 4)",
        "EVALUATE": "Evaluate (Level 5)",
        "CREATE": "Create (Level 6)",
    }
    return level_map.get(level.upper(), level)


def format_program_status(status: ProgramStatus) -> str:
    """Format program status for display."""
    status_map = {
        ProgramStatus.DRAFT: "Draft",
        ProgramStatus.REVIEW: "Under Review",
        ProgramStatus.APPROVED: "Approved",
    }
    return status_map.get(status, str(status))


def format_program_type(prog_type: ProgramType) -> str:
    """Format program type for display."""
    type_map = {
        ProgramType.AA: "Associate in Arts (AA)",
        ProgramType.AS: "Associate in Science (AS)",
        ProgramType.AAT: "Associate in Arts for Transfer (AA-T)",
        ProgramType.AST: "Associate in Science for Transfer (AS-T)",
        ProgramType.CERTIFICATE: "Certificate of Achievement",
        ProgramType.ADT: "Associate Degree for Transfer (ADT)",
    }
    return type_map.get(prog_type, str(prog_type))


def format_requirement_type(req_type: RequirementType) -> str:
    """Format requirement type for display."""
    type_map = {
        RequirementType.REQUIRED_CORE: "Required Core",
        RequirementType.LIST_A: "List A - Restricted Electives",
        RequirementType.LIST_B: "List B - Additional Electives",
        RequirementType.GE: "General Education",
    }
    return type_map.get(req_type, str(req_type))


# =============================================================================
# Course PDF Export
# =============================================================================

@router.get("/api/export/course/{course_id}/pdf")
async def export_course_pdf(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Export a Course Outline of Record (COR) as a PDF document.

    The PDF includes:
    - Course header (code, title, units)
    - Catalog description
    - Units and hours breakdown
    - Student Learning Outcomes (SLOs)
    - Course content outline
    - Prerequisites and corequisites
    - CB Codes summary
    """
    # Fetch course
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Fetch related data
    department = session.get(Department, course.department_id)

    slos_query = select(StudentLearningOutcome).where(
        StudentLearningOutcome.course_id == course_id
    ).order_by(StudentLearningOutcome.sequence)
    slos = session.exec(slos_query).all()

    content_query = select(CourseContent).where(
        CourseContent.course_id == course_id
    ).order_by(CourseContent.sequence)
    content_items = session.exec(content_query).all()

    requisites_query = select(CourseRequisite).where(
        CourseRequisite.course_id == course_id
    )
    requisites = session.exec(requisites_query).all()

    # Create PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.75*inch,
        leftMargin=0.75*inch,
        topMargin=0.75*inch,
        bottomMargin=0.75*inch,
    )

    styles = get_pdf_styles()
    story = []

    # ==========================================================================
    # Header
    # ==========================================================================

    # Institution name
    story.append(Paragraph(
        "Los Angeles Mission College",
        styles['CORBody']
    ))
    story.append(Paragraph(
        "Course Outline of Record",
        styles['CORTitle']
    ))
    story.append(Spacer(1, 0.2*inch))

    # Course code and title
    course_code = f"{course.subject_code} {course.course_number}"
    story.append(Paragraph(
        f"<b>{course_code}</b> - {course.title}",
        styles['SectionHeader']
    ))

    # Department and status
    dept_name = department.name if department else "Unknown Department"
    story.append(Paragraph(
        f"Department: {dept_name} | Status: {format_status(course.status)} | Version: {course.version}",
        styles['CORBody']
    ))

    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#e2e8f0'), spaceAfter=12))

    # ==========================================================================
    # Units & Hours
    # ==========================================================================

    story.append(Paragraph("Units & Hours", styles['SectionHeader']))

    # Calculate total contact hours
    total_contact = int(course.lecture_hours) + int(course.lab_hours) + int(course.activity_hours) + int(course.tba_hours)
    total_student = total_contact + int(course.outside_of_class_hours)

    hours_data = [
        ["Units", str(course.units)],
        ["Lecture Hours", str(int(course.lecture_hours))],
        ["Lab Hours", str(int(course.lab_hours))],
        ["Activity Hours", str(int(course.activity_hours))],
        ["TBA Hours", str(int(course.tba_hours))],
        ["Outside of Class Hours", str(int(course.outside_of_class_hours))],
        ["Total Contact Hours", str(total_contact)],
        ["Total Student Hours", str(total_student)],
    ]

    hours_table = Table(hours_data, colWidths=[3*inch, 1.5*inch])
    hours_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BACKGROUND', (0, -2), (-1, -1), colors.HexColor('#f1f5f9')),
        ('FONTNAME', (0, -2), (-1, -1), 'Helvetica-Bold'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(hours_table)
    story.append(Spacer(1, 0.2*inch))

    # ==========================================================================
    # Catalog Description
    # ==========================================================================

    story.append(Paragraph("Catalog Description", styles['SectionHeader']))
    description = course.catalog_description or "No description provided."
    story.append(Paragraph(description, styles['CORBody']))
    story.append(Spacer(1, 0.15*inch))

    # ==========================================================================
    # Student Learning Outcomes
    # ==========================================================================

    story.append(Paragraph("Student Learning Outcomes (SLOs)", styles['SectionHeader']))

    if slos:
        for i, slo in enumerate(slos, 1):
            bloom_info = format_bloom_level(slo.bloom_level.value if hasattr(slo.bloom_level, 'value') else slo.bloom_level)
            story.append(Paragraph(
                f"<b>SLO {i}:</b> {slo.outcome_text}",
                styles['CORListItem']
            ))
            story.append(Paragraph(
                f"<i>Cognitive Level: {bloom_info}</i>",
                ParagraphStyle(
                    'SLOMeta',
                    parent=styles['CORListItem'],
                    fontSize=9,
                    textColor=colors.gray,
                    leftIndent=40,
                )
            ))
    else:
        story.append(Paragraph("No Student Learning Outcomes defined.", styles['CORBody']))

    story.append(Spacer(1, 0.15*inch))

    # ==========================================================================
    # Course Content Outline
    # ==========================================================================

    story.append(Paragraph("Course Content Outline", styles['SectionHeader']))

    if content_items:
        for item in content_items:
            hours_str = f"({item.hours_allocated} hours)" if item.hours_allocated else ""
            story.append(Paragraph(
                f"<b>{item.sequence}. {item.topic}</b> {hours_str}",
                styles['CORListItem']
            ))
            if item.subtopics:
                for subtopic in item.subtopics:
                    story.append(Paragraph(
                        f"• {subtopic}",
                        ParagraphStyle(
                            'Subtopic',
                            parent=styles['CORListItem'],
                            leftIndent=40,
                        )
                    ))
    else:
        story.append(Paragraph("No content outline defined.", styles['CORBody']))

    story.append(Spacer(1, 0.15*inch))

    # ==========================================================================
    # Prerequisites & Corequisites
    # ==========================================================================

    story.append(Paragraph("Prerequisites & Corequisites", styles['SectionHeader']))

    prereqs = [r for r in requisites if r.type.value == "PREREQUISITE"]
    coreqs = [r for r in requisites if r.type.value == "COREQUISITE"]
    advisories = [r for r in requisites if r.type.value == "ADVISORY"]

    if prereqs:
        story.append(Paragraph("<b>Prerequisites:</b>", styles['CORBody']))
        for req in prereqs:
            if req.requisite_course_id:
                req_course = session.get(Course, req.requisite_course_id)
                if req_course:
                    story.append(Paragraph(
                        f"• {req_course.subject_code} {req_course.course_number} - {req_course.title}",
                        styles['CORListItem']
                    ))
            elif req.requisite_text:
                story.append(Paragraph(f"• {req.requisite_text}", styles['CORListItem']))

    if coreqs:
        story.append(Paragraph("<b>Corequisites:</b>", styles['CORBody']))
        for req in coreqs:
            if req.requisite_course_id:
                req_course = session.get(Course, req.requisite_course_id)
                if req_course:
                    story.append(Paragraph(
                        f"• {req_course.subject_code} {req_course.course_number} - {req_course.title}",
                        styles['CORListItem']
                    ))
            elif req.requisite_text:
                story.append(Paragraph(f"• {req.requisite_text}", styles['CORListItem']))

    if advisories:
        story.append(Paragraph("<b>Advisories:</b>", styles['CORBody']))
        for req in advisories:
            if req.requisite_course_id:
                req_course = session.get(Course, req.requisite_course_id)
                if req_course:
                    story.append(Paragraph(
                        f"• {req_course.subject_code} {req_course.course_number} - {req_course.title}",
                        styles['CORListItem']
                    ))
            elif req.requisite_text:
                story.append(Paragraph(f"• {req.requisite_text}", styles['CORListItem']))

    if not prereqs and not coreqs and not advisories:
        story.append(Paragraph("No prerequisites, corequisites, or advisories.", styles['CORBody']))

    story.append(Spacer(1, 0.15*inch))

    # ==========================================================================
    # CB Codes Summary
    # ==========================================================================

    story.append(Paragraph("CB Codes Summary", styles['SectionHeader']))

    cb_codes = course.cb_codes or {}
    if cb_codes:
        cb_data = []
        key_codes = ['CB03', 'CB04', 'CB05', 'CB08', 'CB09', 'CB21']
        for code in key_codes:
            if code in cb_codes:
                cb_data.append([code, str(cb_codes[code])])

        if cb_data:
            cb_table = Table(cb_data, colWidths=[1*inch, 5*inch])
            cb_table.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
            ]))
            story.append(cb_table)
        else:
            story.append(Paragraph("No CB codes configured.", styles['CORBody']))
    else:
        story.append(Paragraph("No CB codes configured.", styles['CORBody']))

    # ==========================================================================
    # Footer
    # ==========================================================================

    story.append(Spacer(1, 0.5*inch))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#e2e8f0')))
    story.append(Paragraph(
        f"Generated by Calricula on {datetime.utcnow().strftime('%B %d, %Y at %I:%M %p UTC')}",
        styles['Footer']
    ))

    # Build PDF
    doc.build(story)
    buffer.seek(0)

    # Return PDF response
    filename = f"{course.subject_code}_{course.course_number}_COR.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


# =============================================================================
# Course JSON Export (for eLumen)
# =============================================================================

@router.get("/api/export/course/{course_id}/elumen")
async def export_course_elumen(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Export a course in JSON format compatible with eLumen import.

    Returns the course data structured for eLumen's import API.
    """
    # Fetch course
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Fetch related data
    department = session.get(Department, course.department_id)

    slos_query = select(StudentLearningOutcome).where(
        StudentLearningOutcome.course_id == course_id
    ).order_by(StudentLearningOutcome.sequence)
    slos = session.exec(slos_query).all()

    content_query = select(CourseContent).where(
        CourseContent.course_id == course_id
    ).order_by(CourseContent.sequence)
    content_items = session.exec(content_query).all()

    requisites_query = select(CourseRequisite).where(
        CourseRequisite.course_id == course_id
    )
    requisites = session.exec(requisites_query).all()

    # Build eLumen-compatible export structure
    elumen_export = {
        "courseCode": f"{course.subject_code} {course.course_number}",
        "title": course.title,
        "description": course.catalog_description,
        "units": float(course.units),
        "lectureHours": int(course.lecture_hours),
        "labHours": int(course.lab_hours),
        "activityHours": int(course.activity_hours),
        "tbaHours": int(course.tba_hours),
        "outsideOfClassHours": int(course.outside_of_class_hours),
        "totalStudentHours": int(course.lecture_hours) + int(course.lab_hours) + int(course.outside_of_class_hours),
        "department": {
            "code": department.code if department else "",
            "name": department.name if department else "",
        },
        "status": course.status.value,
        "version": course.version,
        "effectiveTerm": course.effective_term,
        "ccnId": course.ccn_id,
        "cbCodes": course.cb_codes or {},
        "transferability": course.transferability or {},
        "geApplicability": course.ge_applicability or {},
        "studentLearningOutcomes": [
            {
                "sequence": slo.sequence,
                "text": slo.outcome_text,
                "bloomLevel": slo.bloom_level.value if hasattr(slo.bloom_level, 'value') else slo.bloom_level,
                "performanceCriteria": slo.performance_criteria,
            }
            for slo in slos
        ],
        "contentOutline": [
            {
                "sequence": item.sequence,
                "topic": item.topic,
                "subtopics": item.subtopics,
                "hoursAllocated": float(item.hours_allocated) if item.hours_allocated else 0,
                "linkedSLOs": item.linked_slos,
            }
            for item in content_items
        ],
        "requisites": [
            {
                "type": req.type.value,
                "requisiteCourseId": str(req.requisite_course_id) if req.requisite_course_id else None,
                "requisiteText": req.requisite_text,
                "contentReview": req.content_review,
            }
            for req in requisites
        ],
        "exportedAt": datetime.utcnow().isoformat(),
        "exportedBy": current_user.email,
    }

    return elumen_export


# =============================================================================
# Program PDF Export
# =============================================================================

@router.get("/api/export/program/{program_id}/pdf")
async def export_program_pdf(
    program_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """
    Export a Program as a PDF document.

    The PDF includes:
    - Program header (title, type, total units)
    - Catalog description
    - Program narrative
    - Course requirements organized by section
    - Unit totals by section
    """
    # Fetch program
    program = session.get(Program, program_id)
    if not program:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Program not found"
        )

    # Fetch related data
    department = session.get(Department, program.department_id)

    # Fetch program courses with their course details
    program_courses_query = select(ProgramCourse).where(
        ProgramCourse.program_id == program_id
    ).order_by(ProgramCourse.requirement_type, ProgramCourse.sequence)
    program_courses = session.exec(program_courses_query).all()

    # Group courses by requirement type
    courses_by_type = {
        RequirementType.REQUIRED_CORE: [],
        RequirementType.LIST_A: [],
        RequirementType.LIST_B: [],
        RequirementType.GE: [],
    }

    for pc in program_courses:
        course = session.get(Course, pc.course_id)
        if course:
            courses_by_type[pc.requirement_type].append({
                "course": course,
                "units_applied": pc.units_applied,
                "sequence": pc.sequence,
            })

    # Create PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.75*inch,
        leftMargin=0.75*inch,
        topMargin=0.75*inch,
        bottomMargin=0.75*inch,
    )

    styles = get_pdf_styles()
    story = []

    # ==========================================================================
    # Header
    # ==========================================================================

    # Institution name
    story.append(Paragraph(
        "Los Angeles Mission College",
        styles['CORBody']
    ))
    story.append(Paragraph(
        "Program Specification",
        styles['CORTitle']
    ))
    story.append(Spacer(1, 0.2*inch))

    # Program title and type
    story.append(Paragraph(
        f"<b>{program.title}</b>",
        styles['SectionHeader']
    ))
    story.append(Paragraph(
        f"Type: {format_program_type(program.type)}",
        styles['CORBody']
    ))

    # Department and status
    dept_name = department.name if department else "Unknown Department"
    story.append(Paragraph(
        f"Department: {dept_name} | Status: {format_program_status(program.status)}",
        styles['CORBody']
    ))

    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#e2e8f0'), spaceAfter=12))

    # ==========================================================================
    # Program Summary
    # ==========================================================================

    story.append(Paragraph("Program Summary", styles['SectionHeader']))

    summary_data = [
        ["Total Units Required", str(program.total_units)],
        ["TOP Code", program.top_code or "Not specified"],
        ["CIP Code", program.cip_code or "Not specified"],
    ]

    summary_table = Table(summary_data, colWidths=[3*inch, 2.5*inch])
    summary_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('ALIGN', (1, 0), (1, -1), 'LEFT'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 0.2*inch))

    # ==========================================================================
    # Catalog Description
    # ==========================================================================

    story.append(Paragraph("Catalog Description", styles['SectionHeader']))
    description = program.catalog_description or "No description provided."
    story.append(Paragraph(description, styles['CORBody']))
    story.append(Spacer(1, 0.15*inch))

    # ==========================================================================
    # Program Narrative
    # ==========================================================================

    if program.program_narrative:
        story.append(Paragraph("Program Narrative", styles['SectionHeader']))
        story.append(Paragraph(program.program_narrative, styles['CORBody']))
        story.append(Spacer(1, 0.15*inch))

    # ==========================================================================
    # Course Requirements
    # ==========================================================================

    story.append(Paragraph("Course Requirements", styles['SectionHeader']))

    total_program_units = Decimal("0")

    # Process each requirement type
    for req_type in [RequirementType.REQUIRED_CORE, RequirementType.LIST_A, RequirementType.LIST_B, RequirementType.GE]:
        courses = courses_by_type[req_type]
        if not courses:
            continue

        story.append(Paragraph(format_requirement_type(req_type), styles['SubsectionHeader']))

        # Build table data for courses
        table_data = [["Course", "Title", "Units"]]
        section_units = Decimal("0")

        for item in courses:
            course = item["course"]
            units = item["units_applied"] if item["units_applied"] > 0 else course.units
            course_code = f"{course.subject_code} {course.course_number}"
            table_data.append([course_code, course.title, str(units)])
            section_units += units

        # Add section total
        table_data.append(["", "Section Total:", str(section_units)])
        total_program_units += section_units

        # Create table
        courses_table = Table(table_data, colWidths=[1.5*inch, 4*inch, 1*inch])
        courses_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5f9')),
            ('ALIGN', (2, 0), (2, -1), 'RIGHT'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('LINEBELOW', (0, 0), (-1, 0), 1, colors.HexColor('#e2e8f0')),
            ('FONTNAME', (1, -1), (-1, -1), 'Helvetica-Bold'),
            ('LINEABOVE', (0, -1), (-1, -1), 1, colors.HexColor('#e2e8f0')),
        ]))
        story.append(courses_table)
        story.append(Spacer(1, 0.15*inch))

    # ==========================================================================
    # Total Units Summary
    # ==========================================================================

    story.append(Paragraph("Total Units Summary", styles['SectionHeader']))

    # Check for high-unit major warning
    is_high_unit = total_program_units > 60

    total_data = [
        ["Total Program Units", str(total_program_units)],
        ["Required for Degree", str(program.total_units)],
    ]

    if is_high_unit:
        total_data.append(["Note", "This is a high-unit major (>60 units)"])

    total_table = Table(total_data, colWidths=[3*inch, 2.5*inch])
    total_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('BACKGROUND', (0, 0), (-1, 1), colors.HexColor('#f1f5f9')),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('TEXTCOLOR', (0, -1), (-1, -1), colors.HexColor('#d97706') if is_high_unit else colors.black),
    ]))
    story.append(total_table)

    # ==========================================================================
    # Footer
    # ==========================================================================

    story.append(Spacer(1, 0.5*inch))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#e2e8f0')))
    story.append(Paragraph(
        f"Generated by Calricula on {datetime.utcnow().strftime('%B %d, %Y at %I:%M %p UTC')}",
        styles['Footer']
    ))

    # Build PDF
    doc.build(story)
    buffer.seek(0)

    # Return PDF response
    # Create safe filename
    safe_title = "".join(c if c.isalnum() or c in " -_" else "_" for c in program.title)
    safe_title = safe_title.replace(" ", "_")[:50]
    filename = f"{safe_title}_Program.pdf"

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )


# =============================================================================
# Public-Facing Course View (CUR-112)
# =============================================================================

@router.get("/api/export/course/{course_id}/public")
async def get_public_course_view(
    course_id: uuid.UUID,
    format: Optional[str] = "json",
    session: Session = Depends(get_session),
):
    """
    Get a simplified public-facing view of a Course Outline of Record.

    This endpoint is designed for:
    - College catalog publications
    - Articulation agreements
    - Public-facing course information
    - External system integrations

    The response excludes internal compliance codes (CB codes) and focuses
    on information relevant to students and articulation officers.

    Parameters:
    - course_id: UUID of the course
    - format: "json" (default) or "html" for formatted HTML output

    Returns simplified course data suitable for public use.

    **Note:** This endpoint does not require authentication.
    """
    # Fetch course
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )

    # Fetch related data
    department = session.get(Department, course.department_id)

    slos_query = select(StudentLearningOutcome).where(
        StudentLearningOutcome.course_id == course_id
    ).order_by(StudentLearningOutcome.sequence)
    slos = session.exec(slos_query).all()

    content_query = select(CourseContent).where(
        CourseContent.course_id == course_id
    ).order_by(CourseContent.sequence)
    content_items = session.exec(content_query).all()

    requisites_query = select(CourseRequisite).where(
        CourseRequisite.course_id == course_id
    )
    requisites = session.exec(requisites_query).all()

    # Process requisites for public view
    def format_requisite_for_public(req: CourseRequisite) -> dict:
        """Format a requisite for public display."""
        result = {
            "type": req.type.value.lower().replace("_", " ").title(),
        }
        if req.requisite_course_id:
            req_course = session.get(Course, req.requisite_course_id)
            if req_course:
                result["course"] = f"{req_course.subject_code} {req_course.course_number}"
                result["courseTitle"] = req_course.title
        elif req.requisite_text:
            result["description"] = req.requisite_text
        return result

    # Build public-facing data structure (NO CB codes!)
    public_data = {
        # Basic course information
        "courseCode": f"{course.subject_code} {course.course_number}",
        "subjectCode": course.subject_code,
        "courseNumber": course.course_number,
        "title": course.title,
        "description": course.catalog_description or "",

        # Department info
        "department": {
            "code": department.code if department else "",
            "name": department.name if department else "",
        },

        # Units and hours (public-relevant info only)
        "units": {
            "value": float(course.units),
            "minimum": float(course.minimum_units) if course.minimum_units else float(course.units),
            "maximum": float(course.maximum_units) if course.maximum_units else float(course.units),
            "isVariable": course.minimum_units != course.maximum_units if course.minimum_units and course.maximum_units else False,
        },
        "hours": {
            "lecture": int(course.lecture_hours) if course.lecture_hours else 0,
            "lab": int(course.lab_hours) if course.lab_hours else 0,
            "activity": int(course.activity_hours) if course.activity_hours else 0,
            "total": int(course.lecture_hours or 0) + int(course.lab_hours or 0) + int(course.activity_hours or 0),
        },

        # Transferability (public-relevant info)
        "transferability": {
            "uc": (course.transferability or {}).get("uc", False),
            "csu": (course.transferability or {}).get("csu", False),
        },

        # GE applicability (public-relevant info)
        "geApplicability": {
            "calGetc": (course.ge_applicability or {}).get("cal_getc", []),
            "csuGe": (course.ge_applicability or {}).get("csu_ge", []),
            "igetc": (course.ge_applicability or {}).get("igetc", []),
            "localGe": (course.ge_applicability or {}).get("local_ge", []),
        },

        # C-ID alignment (for articulation)
        "cId": {
            "number": course.ccn_id if course.ccn_id else None,
            "isAligned": bool(course.ccn_id),
        },

        # Student Learning Outcomes
        "studentLearningOutcomes": [
            {
                "number": i + 1,
                "outcome": slo.outcome_text,
                "level": format_bloom_level(slo.bloom_level.value if hasattr(slo.bloom_level, 'value') else slo.bloom_level),
            }
            for i, slo in enumerate(slos)
        ],

        # Course content outline
        "contentOutline": [
            {
                "number": item.sequence,
                "topic": item.topic,
                "subtopics": item.subtopics or [],
            }
            for item in content_items
        ],

        # Prerequisites and corequisites
        "prerequisites": [
            format_requisite_for_public(req)
            for req in requisites
            if req.type.value == "PREREQUISITE"
        ],
        "corequisites": [
            format_requisite_for_public(req)
            for req in requisites
            if req.type.value == "COREQUISITE"
        ],
        "advisories": [
            format_requisite_for_public(req)
            for req in requisites
            if req.type.value == "ADVISORY"
        ],

        # Course metadata (non-compliance)
        "effectiveTerm": course.effective_term,
        "version": course.version,
        "lastUpdated": course.updated_at.isoformat() if course.updated_at else None,
        "status": "Approved" if course.status == CourseStatus.APPROVED else "Pending Approval",

        # Institution info
        "institution": {
            "name": "Los Angeles Mission College",
        },
    }

    # Return HTML format if requested
    if format.lower() == "html":
        html_content = _generate_public_html(public_data)
        from fastapi.responses import HTMLResponse
        return HTMLResponse(content=html_content, media_type="text/html")

    return public_data


def _generate_public_html(data: dict) -> str:
    """Generate HTML view for public course display."""

    # Build prerequisites string
    prereqs_html = ""
    if data["prerequisites"]:
        prereqs = ", ".join([
            p.get("course", p.get("description", ""))
            for p in data["prerequisites"]
        ])
        prereqs_html = f"<p><strong>Prerequisites:</strong> {prereqs}</p>"

    # Build corequisites string
    coreqs_html = ""
    if data["corequisites"]:
        coreqs = ", ".join([
            c.get("course", c.get("description", ""))
            for c in data["corequisites"]
        ])
        coreqs_html = f"<p><strong>Corequisites:</strong> {coreqs}</p>"

    # Build SLOs list
    slos_html = ""
    if data["studentLearningOutcomes"]:
        slo_items = "\n".join([
            f"<li>{slo['outcome']}</li>"
            for slo in data["studentLearningOutcomes"]
        ])
        slos_html = f"""
        <h3>Student Learning Outcomes</h3>
        <ol>{slo_items}</ol>
        """

    # Build content outline
    content_html = ""
    if data["contentOutline"]:
        content_items = "\n".join([
            f"""<li>
                <strong>{item['topic']}</strong>
                {('<ul>' + ''.join([f'<li>{st}</li>' for st in item['subtopics']]) + '</ul>') if item['subtopics'] else ''}
            </li>"""
            for item in data["contentOutline"]
        ])
        content_html = f"""
        <h3>Course Content</h3>
        <ol>{content_items}</ol>
        """

    # Build transferability badges
    transfer_html = ""
    transfers = []
    if data["transferability"]["uc"]:
        transfers.append('<span class="badge badge-uc">UC Transferable</span>')
    if data["transferability"]["csu"]:
        transfers.append('<span class="badge badge-csu">CSU Transferable</span>')
    if data["cId"]["isAligned"]:
        transfers.append(f'<span class="badge badge-cid">C-ID: {data["cId"]["number"]}</span>')
    if transfers:
        transfer_html = f'<div class="transferability">{" ".join(transfers)}</div>'

    # Units display
    units_display = str(data["units"]["value"])
    if data["units"]["isVariable"]:
        units_display = f"{data['units']['minimum']}-{data['units']['maximum']}"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{data['courseCode']} - {data['title']}</title>
    <style>
        :root {{
            --luminous-500: #6366f1;
            --luminous-600: #4f46e5;
            --luminous-700: #4338ca;
        }}
        body {{
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            line-height: 1.6;
            color: #1f2937;
        }}
        .header {{
            border-bottom: 2px solid var(--luminous-500);
            padding-bottom: 1rem;
            margin-bottom: 1.5rem;
        }}
        .course-code {{
            color: var(--luminous-600);
            font-size: 1.5rem;
            font-weight: 700;
            margin: 0;
        }}
        .course-title {{
            font-size: 1.25rem;
            color: #374151;
            margin: 0.25rem 0;
        }}
        .meta {{
            color: #6b7280;
            font-size: 0.875rem;
        }}
        .units-hours {{
            display: flex;
            gap: 2rem;
            background: #f3f4f6;
            padding: 1rem;
            border-radius: 0.5rem;
            margin: 1rem 0;
        }}
        .units-hours span {{
            font-weight: 600;
        }}
        .description {{
            background: #fefce8;
            padding: 1rem;
            border-left: 4px solid #eab308;
            margin: 1rem 0;
        }}
        .badge {{
            display: inline-block;
            padding: 0.25rem 0.75rem;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 600;
            margin-right: 0.5rem;
        }}
        .badge-uc {{
            background: #dbeafe;
            color: #1d4ed8;
        }}
        .badge-csu {{
            background: #dcfce7;
            color: #16a34a;
        }}
        .badge-cid {{
            background: #f3e8ff;
            color: #7c3aed;
        }}
        .transferability {{
            margin: 1rem 0;
        }}
        h3 {{
            color: var(--luminous-700);
            border-bottom: 1px solid #e5e7eb;
            padding-bottom: 0.5rem;
        }}
        ol, ul {{
            padding-left: 1.5rem;
        }}
        li {{
            margin-bottom: 0.5rem;
        }}
        .footer {{
            margin-top: 2rem;
            padding-top: 1rem;
            border-top: 1px solid #e5e7eb;
            font-size: 0.75rem;
            color: #9ca3af;
            text-align: center;
        }}
    </style>
</head>
<body>
    <div class="header">
        <p class="course-code">{data['courseCode']}</p>
        <p class="course-title">{data['title']}</p>
        <p class="meta">{data['department']['name']} | {data['status']}</p>
    </div>

    <div class="units-hours">
        <div><span>Units:</span> {units_display}</div>
        <div><span>Lecture:</span> {data['hours']['lecture']} hrs</div>
        <div><span>Lab:</span> {data['hours']['lab']} hrs</div>
    </div>

    {transfer_html}

    <div class="description">
        <strong>Catalog Description:</strong><br>
        {data['description'] or 'No description available.'}
    </div>

    {prereqs_html}
    {coreqs_html}

    {slos_html}

    {content_html}

    <div class="footer">
        <p>{data['institution']['name']} | {data['institution']['district']}</p>
        <p>Last updated: {data['lastUpdated'][:10] if data['lastUpdated'] else 'N/A'}</p>
    </div>
</body>
</html>"""

    return html