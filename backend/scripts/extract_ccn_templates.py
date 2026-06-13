#!/usr/bin/env python3
"""
CCN Template PDF Extraction Script

Extracts structured data from CCN (Common Course Numbering) template PDFs
and outputs JSON for database seeding.

Usage:
    python extract_ccn_templates.py /path/to/ccn/pdfs output.json

Or with default paths:
    python extract_ccn_templates.py
"""

import fitz  # PyMuPDF
import json
import os
import re
import sys
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Default paths
DEFAULT_CCN_DIR = "/Users/laccd/calricula/calricula_docs/knowledge-base/ccn"
DEFAULT_OUTPUT_FILE = Path(__file__).parent.parent / "seeds" / "data" / "ccn_templates_extracted.json"


def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract all text from a PDF file."""
    doc = fitz.open(pdf_path)
    full_text = ""
    for page in doc:
        full_text += page.get_text()
    doc.close()
    return full_text


def clean_text(text: str) -> str:
    """Clean extracted text - normalize whitespace and remove artifacts."""
    # Remove page number artifacts
    text = re.sub(r'Phase IIB? CCN Template \| \d+', '', text)
    text = re.sub(r'A11Y \d+/\d+/\d+', '', text)

    # Normalize whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)

    return text.strip()


def extract_field(text: str, pattern: str, group: int = 1, default: str = "") -> str:
    """Extract a field using regex pattern."""
    match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
    if match:
        return match.group(group).strip()
    return default


def extract_subject_code(text: str) -> str:
    """Extract the subject code (e.g., ANTH, BIOL, MATH)."""
    pattern = r'Subject\s+Code:\s*([A-Z]{2,6})'
    return extract_field(text, pattern)


def extract_course_number(text: str) -> str:
    """Extract the course number (e.g., C1000)."""
    pattern = r'Proposed\s+Course\s+Number\s*\([^)]+\):\s*(C\d+[A-Z]*)'
    return extract_field(text, pattern)


def extract_title(text: str) -> str:
    """Extract the course title."""
    pattern = r'Course\s+Title\s*\([^)]+\):\s*([^\n]+)'
    return extract_field(text, pattern)


def extract_description(text: str) -> str:
    """Extract the catalog description (Part 1 - Identical and Required)."""
    pattern = r'Part\s+1\s*\(Identical\s+and\s+Required\):\s*([^\n]+(?:\n(?!Part\s+2)[^\n]+)*)'
    # Find in Catalog/Course Description section
    desc_section = re.search(
        r'Catalog/Course\s+Description.*?Part\s+1\s*\(Identical\s+and\s+Required\):\s*([^\n]+(?:\n(?!Part\s+2)[^\n]+)*)',
        text,
        re.IGNORECASE | re.DOTALL
    )
    if desc_section:
        description = desc_section.group(1).strip()
        # Clean up multi-line descriptions
        description = re.sub(r'\s+', ' ', description)
        return description
    return ""


def extract_minimum_units(text: str) -> float:
    """Extract minimum unit threshold."""
    pattern = r'Minimum\s+Unit\s+Threshold\s*\|\s*([\d.]+)\s*Semester\s+Units'
    units_str = extract_field(text, pattern)
    try:
        return float(units_str)
    except ValueError:
        return 0.0


def extract_prerequisites(text: str) -> Optional[str]:
    """Extract prerequisites."""
    pattern = r'Prerequisites\s*\([^)]+\):\s*([^\n]+)'
    prereq = extract_field(text, pattern)
    if prereq.lower() == 'none':
        return None
    return prereq if prereq else None


def extract_corequisites(text: str) -> Optional[str]:
    """Extract corequisites."""
    pattern = r'Co-?Requisites\s*\([^)]+\):\s*([^\n]+)'
    coreq = extract_field(text, pattern)
    if coreq.lower() == 'none':
        return None
    return coreq if coreq else None


def extract_numbered_list(text: str, start_marker: str, end_marker: str) -> List[str]:
    """Extract a numbered list of items between markers."""
    if text is None:
        return []

    # Find the section
    pattern = f'{start_marker}(.*?){end_marker}'
    match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
    if not match:
        return []

    section_text = match.group(1)
    if section_text is None:
        return []

    # Extract numbered items (1., 2., etc.)
    items = re.findall(r'\d+\.\s*([^\n]+(?:\n(?!\d+\.)[^\n]+)*)', section_text)

    # Clean each item
    cleaned_items = []
    for item in items:
        item = re.sub(r'\s+', ' ', item).strip()
        if item:
            cleaned_items.append(item)

    return cleaned_items


def extract_objectives(text: str) -> List[str]:
    """Extract course objectives (Part 1 - Required)."""
    # Look for Course Objectives/Outcomes section
    section_start = r'Course\s+Objectives/Outcomes.*?Part\s+1\s*\([^)]+\):.*?should\s+be\s+able\s+to[^:]*:'
    section_end = r'Part\s+2\s*Optional|Methods\s+of\s+Evaluation'

    return extract_numbered_list(text, section_start, section_end)


def extract_content_topics(text: str) -> List[str]:
    """Extract required course content topics."""
    section_start = r'Course\s+Content.*?Part\s+1:\s*Required\s+Topics\s*\([^)]+\):'
    section_end = r'Part\s+2:\s*Optional|Laboratory\s+Content'

    return extract_numbered_list(text, section_start, section_end)


def extract_lab_topics(text: str) -> List[str]:
    """Extract laboratory content topics."""
    section_start = r'Laboratory\s+Content.*?Part\s+1:\s*Required\s+Topics\s*\([^)]+\):.*?(?:include|limited\s+to):'
    section_end = r'Part\s+2:\s*Optional|Course\s+Objectives'

    return extract_numbered_list(text, section_start, section_end)


def extract_evaluation_methods(text: str) -> Optional[str]:
    """Extract methods of evaluation description."""
    pattern = r'Methods\s+of\s+Evaluation.*?Part\s+1\s*\([^)]+\):\s*(.*?)(?:Part\s+2|Representative\s+Texts)'
    match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
    if match:
        eval_text = match.group(1).strip()
        # Clean up
        eval_text = re.sub(r'\s+', ' ', eval_text)
        return eval_text if eval_text else None
    return None


def extract_representative_texts(text: str) -> List[str]:
    """Extract representative textbooks."""
    texts = []
    if text is None:
        return texts

    # Find the texts section
    section_start = r'Representative\s+Texts.*?Part\s+1\s*\([^)]+\):.*?(?:include|limited\s+to)[^:]*:'
    section_end = r'Part\s+2\s+List|Date\s+Approved'

    match = re.search(f'{section_start}(.*?){section_end}', text, re.DOTALL | re.IGNORECASE)
    if match:
        section_text = match.group(1)
        if section_text is None:
            return texts

        # Extract bullet points (• format)
        bullet_items = re.findall(r'•\s*([^\n•]+(?:\n(?!•)[^\n•]+)*)', section_text)
        for item in bullet_items:
            item = re.sub(r'\s+', ' ', item).strip()
            if item and 'locally developed' not in item.lower():
                texts.append(item)

    return texts


def extract_approved_date(text: str) -> Optional[str]:
    """Extract the approval date."""
    # Look for date pattern
    pattern = r'Date\s+Approved:\s*([^\n,]+)'
    date_str = extract_field(text, pattern)

    # Also check the header date
    header_pattern = r'Date:\s*(\d+-\d+-\d+)'
    header_date = extract_field(text, header_pattern)

    if header_date:
        try:
            # Parse date like "6-16-2025"
            parts = header_date.split('-')
            if len(parts) == 3:
                month, day, year = int(parts[0]), int(parts[1]), int(parts[2])
                return f"{year}-{month:02d}-{day:02d}"
        except:
            pass

    return date_str if date_str else None


def parse_specialty_identifiers(course_number: str) -> Dict[str, bool]:
    """Parse CCN specialty identifiers from course number."""
    identifiers = {
        'is_honors': False,
        'is_lab_only': False,
        'is_support_course': False,
        'has_embedded_support': False
    }

    if not course_number:
        return identifiers

    # Check for suffixes after the number
    suffix = re.sub(r'C\d+', '', course_number).upper()

    if 'H' in suffix:
        identifiers['is_honors'] = True
    if 'L' in suffix and suffix.endswith('L'):
        identifiers['is_lab_only'] = True
    elif 'L' in suffix and 'H' in suffix:
        # LH = Lab + Honors
        identifiers['is_lab_only'] = True
    if 'S' in suffix:
        identifiers['is_support_course'] = True
    if 'E' in suffix:
        identifiers['has_embedded_support'] = True

    return identifiers


def extract_ccn_template(pdf_path: str) -> Dict[str, Any]:
    """Extract all fields from a CCN template PDF."""
    filename = os.path.basename(pdf_path)
    logger.info(f"Processing: {filename}")

    text = extract_text_from_pdf(pdf_path)
    text = clean_text(text)

    subject_code = extract_subject_code(text)
    course_number = extract_course_number(text)
    title = extract_title(text)

    # Build C-ID (e.g., "ANTH C1000")
    c_id = f"{subject_code} {course_number}" if subject_code and course_number else ""

    # Extract specialty identifiers
    specialty = parse_specialty_identifiers(course_number)

    # Extract content
    objectives = extract_objectives(text)
    content_topics = extract_content_topics(text)
    lab_topics = extract_lab_topics(text)

    # Combine content requirements
    content_requirements = content_topics
    if lab_topics:
        content_requirements = content_topics + ["Lab: " + topic for topic in lab_topics]

    template = {
        "c_id": c_id,
        "subject_code": subject_code,
        "course_number": course_number,
        "discipline": subject_code,  # Same as subject_code
        "title": title,
        "description": extract_description(text),
        "minimum_units": extract_minimum_units(text),
        "prerequisites": extract_prerequisites(text),
        "corequisites": extract_corequisites(text),
        "objectives": objectives,
        "content_requirements": content_requirements,
        "evaluation_methods": extract_evaluation_methods(text),
        "representative_texts": extract_representative_texts(text),
        "is_honors": specialty['is_honors'],
        "is_lab_only": specialty['is_lab_only'],
        "is_support_course": specialty['is_support_course'],
        "has_embedded_support": specialty['has_embedded_support'],
        "implied_cb05": "A",  # All CCN = UC+CSU transferable
        "implied_top_code": None,  # Will be set by seed script using discipline mapping
        "source_file": filename,
        "approved_date": extract_approved_date(text),
        "extracted_at": datetime.now(timezone.utc).isoformat()
    }

    # Log warnings for missing critical fields
    if not c_id:
        logger.warning(f"  Missing C-ID for {filename}")
    if not title:
        logger.warning(f"  Missing title for {filename}")
    if not objectives:
        logger.warning(f"  No objectives extracted for {filename}")

    return template


def extract_all_templates(ccn_dir: str) -> List[Dict[str, Any]]:
    """Extract all CCN templates from a directory."""
    templates = []
    errors = []

    pdf_files = sorted(Path(ccn_dir).glob("*.pdf"))
    logger.info(f"Found {len(pdf_files)} PDF files")

    for pdf_path in pdf_files:
        try:
            template = extract_ccn_template(str(pdf_path))
            templates.append(template)
        except Exception as e:
            logger.error(f"Error processing {pdf_path.name}: {e}")
            errors.append({
                "file": pdf_path.name,
                "error": str(e)
            })

    logger.info(f"Successfully extracted {len(templates)} templates")
    if errors:
        logger.warning(f"Errors in {len(errors)} files")

    return templates


def main():
    """Main entry point."""
    # Parse arguments
    ccn_dir = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CCN_DIR
    output_file = sys.argv[2] if len(sys.argv) > 2 else str(DEFAULT_OUTPUT_FILE)

    # Validate input
    if not os.path.isdir(ccn_dir):
        logger.error(f"CCN directory not found: {ccn_dir}")
        sys.exit(1)

    # Extract templates
    templates = extract_all_templates(ccn_dir)

    # Create output directory if needed
    output_path = Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Write output
    with open(output_file, 'w') as f:
        json.dump(templates, f, indent=2)

    logger.info(f"Output written to: {output_file}")

    # Print summary
    print("\n" + "="*60)
    print("EXTRACTION SUMMARY")
    print("="*60)
    print(f"Total PDFs processed: {len(templates)}")
    print(f"Output file: {output_file}")

    # Count specialty types
    honors = sum(1 for t in templates if t['is_honors'])
    lab_only = sum(1 for t in templates if t['is_lab_only'])

    print(f"\nTemplate types:")
    print(f"  Standard courses: {len(templates) - honors - lab_only}")
    print(f"  Honors variants: {honors}")
    print(f"  Lab-only courses: {lab_only}")

    # Sample output
    if templates:
        print(f"\nSample extraction ({templates[0]['c_id']}):")
        sample = templates[0]
        print(f"  Title: {sample['title']}")
        print(f"  Units: {sample['minimum_units']}")
        print(f"  Objectives: {len(sample['objectives'])} items")
        print(f"  Content: {len(sample['content_requirements'])} topics")


if __name__ == "__main__":
    main()
