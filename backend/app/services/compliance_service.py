"""
Compliance Service

Provides comprehensive compliance checking for Course Outlines of Record (COR)
against community college regulations including:
- Title 5 (California Code of Regulations)
- PCAH 8th Edition (Program and Course Approval Handbook)
- CB Code requirements and dependencies
"""

from typing import List, Dict, Any, Optional
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel


class ComplianceStatus(str, Enum):
    """Status of a compliance check."""
    PASS = "pass"
    FAIL = "fail"
    WARN = "warn"


class ComplianceCategory(str, Enum):
    """Categories of compliance rules."""
    TITLE_5 = "Title 5"
    PCAH = "PCAH"
    CB_CODES = "CB Codes"
    UNITS_HOURS = "Units & Hours"
    SLO = "Student Learning Outcomes"
    CONTENT = "Course Content"
    REQUISITES = "Requisites"
    GENERAL = "General"
    CCN = "CCN/AB 1111"  # Common Course Numbering (AB 1111)


class ComplianceResult(BaseModel):
    """Result of a single compliance check."""
    rule_id: str
    rule_name: str
    category: ComplianceCategory
    status: ComplianceStatus
    message: str
    section: str  # COR section this applies to
    citation: Optional[str] = None  # Legal/regulatory citation
    recommendation: Optional[str] = None


class ComplianceAuditResponse(BaseModel):
    """Full compliance audit response."""
    overall_status: ComplianceStatus
    compliance_score: float  # Percentage (0-100)
    total_checks: int
    passed: int
    failed: int
    warnings: int
    results: List[ComplianceResult]
    results_by_category: Dict[str, List[ComplianceResult]]


class ComplianceService:
    """
    Compliance checking service for community college CORs.

    Implements rules from:
    - Title 5 § 55002 (Standards and Criteria for Courses)
    - Title 5 § 55002.5 (54-hour rule for unit calculation)
    - Title 5 § 55003 (Policies for Prerequisites, Corequisites, and Advisories)
    - PCAH 8th Edition
    """

    def audit_course(
        self,
        course_data: Dict[str, Any],
        slos: List[Dict[str, Any]],
        content_items: List[Dict[str, Any]],
        requisites: List[Dict[str, Any]],
    ) -> ComplianceAuditResponse:
        """
        Run a full compliance audit on a course.

        Args:
            course_data: Course fields (title, units, hours, cb_codes, etc.)
            slos: List of Student Learning Outcomes
            content_items: List of course content/topics
            requisites: List of prerequisites, corequisites, advisories

        Returns:
            ComplianceAuditResponse with all check results
        """
        results: List[ComplianceResult] = []

        # Run all compliance checks
        results.extend(self._check_basic_info(course_data))
        results.extend(self._check_units_hours(course_data))
        results.extend(self._check_cb_codes(course_data))
        results.extend(self._check_slos(slos))
        results.extend(self._check_content(content_items, course_data))
        results.extend(self._check_requisites(requisites))
        results.extend(self._check_ccn_alignment(course_data))

        # Calculate summary stats
        passed = sum(1 for r in results if r.status == ComplianceStatus.PASS)
        failed = sum(1 for r in results if r.status == ComplianceStatus.FAIL)
        warnings = sum(1 for r in results if r.status == ComplianceStatus.WARN)
        total = len(results)

        # Determine overall status
        if failed > 0:
            overall_status = ComplianceStatus.FAIL
        elif warnings > 0:
            overall_status = ComplianceStatus.WARN
        else:
            overall_status = ComplianceStatus.PASS

        # Calculate compliance score (fails=0 points, warns=0.5 points, pass=1 point)
        score = ((passed + (warnings * 0.5)) / total * 100) if total > 0 else 100.0

        # Group results by category
        results_by_category: Dict[str, List[ComplianceResult]] = {}
        for result in results:
            category_key = result.category.value
            if category_key not in results_by_category:
                results_by_category[category_key] = []
            results_by_category[category_key].append(result)

        return ComplianceAuditResponse(
            overall_status=overall_status,
            compliance_score=round(score, 1),
            total_checks=total,
            passed=passed,
            failed=failed,
            warnings=warnings,
            results=results,
            results_by_category=results_by_category,
        )

    def _check_basic_info(self, course: Dict[str, Any]) -> List[ComplianceResult]:
        """Check basic course information requirements."""
        results = []

        # Check course title
        title = course.get("title", "")
        if not title:
            results.append(ComplianceResult(
                rule_id="BASIC-001",
                rule_name="Course Title Required",
                category=ComplianceCategory.GENERAL,
                status=ComplianceStatus.FAIL,
                message="Course must have a title.",
                section="Basic Info",
                citation="PCAH 8th Ed., Section 2.1",
            ))
        elif len(title) < 5:
            results.append(ComplianceResult(
                rule_id="BASIC-001",
                rule_name="Course Title Required",
                category=ComplianceCategory.GENERAL,
                status=ComplianceStatus.WARN,
                message="Course title is very short. Consider a more descriptive title.",
                section="Basic Info",
            ))
        else:
            results.append(ComplianceResult(
                rule_id="BASIC-001",
                rule_name="Course Title Required",
                category=ComplianceCategory.GENERAL,
                status=ComplianceStatus.PASS,
                message="Course has a valid title.",
                section="Basic Info",
            ))

        # Check catalog description
        description = course.get("catalog_description", "")
        if not description:
            results.append(ComplianceResult(
                rule_id="BASIC-002",
                rule_name="Catalog Description Required",
                category=ComplianceCategory.GENERAL,
                status=ComplianceStatus.FAIL,
                message="Course must have a catalog description.",
                section="Basic Info",
                citation="PCAH 8th Ed., Section 2.2",
            ))
        else:
            word_count = len(description.split())
            if word_count < 25:
                results.append(ComplianceResult(
                    rule_id="BASIC-002",
                    rule_name="Catalog Description Required",
                    category=ComplianceCategory.GENERAL,
                    status=ComplianceStatus.WARN,
                    message=f"Catalog description is short ({word_count} words). Recommended: 25-75 words.",
                    section="Basic Info",
                    recommendation="Expand description to include course scope, topics, and learning goals.",
                ))
            elif word_count > 100:
                results.append(ComplianceResult(
                    rule_id="BASIC-002",
                    rule_name="Catalog Description Required",
                    category=ComplianceCategory.GENERAL,
                    status=ComplianceStatus.WARN,
                    message=f"Catalog description is long ({word_count} words). Recommended: 25-75 words.",
                    section="Basic Info",
                    recommendation="Consider condensing the description for catalog brevity.",
                ))
            else:
                results.append(ComplianceResult(
                    rule_id="BASIC-002",
                    rule_name="Catalog Description Required",
                    category=ComplianceCategory.GENERAL,
                    status=ComplianceStatus.PASS,
                    message=f"Catalog description present ({word_count} words).",
                    section="Basic Info",
                ))

        return results

    def _check_units_hours(self, course: Dict[str, Any]) -> List[ComplianceResult]:
        """Check unit and hours compliance with Title 5 § 55002.5 (54-hour rule)."""
        results = []

        # Get hours values (handle both Decimal and int/float)
        def to_decimal(val) -> Decimal:
            if val is None:
                return Decimal("0")
            if isinstance(val, Decimal):
                return val
            return Decimal(str(val))

        units = to_decimal(course.get("units", 0))
        lecture_hours = to_decimal(course.get("lecture_hours", 0))
        lab_hours = to_decimal(course.get("lab_hours", 0))
        outside_hours = to_decimal(course.get("outside_of_class_hours", 0))

        # Check unit range (Title 5 § 55002.5)
        if units < Decimal("0.5") or units > Decimal("18"):
            results.append(ComplianceResult(
                rule_id="UNIT-001",
                rule_name="Valid Unit Range",
                category=ComplianceCategory.UNITS_HOURS,
                status=ComplianceStatus.FAIL,
                message=f"Units ({units}) must be between 0.5 and 18.",
                section="Units & Hours",
                citation="Title 5 § 55002.5",
            ))
        else:
            results.append(ComplianceResult(
                rule_id="UNIT-001",
                rule_name="Valid Unit Range",
                category=ComplianceCategory.UNITS_HOURS,
                status=ComplianceStatus.PASS,
                message=f"Unit value ({units}) is within valid range.",
                section="Units & Hours",
            ))

        # Calculate Total Student Learning Hours using the 54-hour rule
        # Weekly hours × semester weeks = semester hours
        # Lecture: weekly × 18 weeks
        # Lab: weekly × 54 (labs are 1:1 ratio)
        # Outside: weekly × 18 weeks
        calculated_total_hours = (
            (lecture_hours * 18) +
            (lab_hours * 54) +
            (outside_hours * 18)
        )

        # Check 54-hour rule: Total Hours / 54 = Units
        expected_units = calculated_total_hours / 54

        # Allow small tolerance for rounding
        tolerance = Decimal("0.25")
        if abs(expected_units - units) > tolerance:
            results.append(ComplianceResult(
                rule_id="UNIT-002",
                rule_name="54-Hour Rule Compliance",
                category=ComplianceCategory.TITLE_5,
                status=ComplianceStatus.FAIL,
                message=f"Hours do not match units. Total hours ({calculated_total_hours}) ÷ 54 = {expected_units:.2f} units, but {units} units specified.",
                section="Units & Hours",
                citation="Title 5 § 55002.5",
                recommendation=f"Adjust hours so total student learning hours = {units * 54} for {units} units.",
            ))
        else:
            results.append(ComplianceResult(
                rule_id="UNIT-002",
                rule_name="54-Hour Rule Compliance",
                category=ComplianceCategory.TITLE_5,
                status=ComplianceStatus.PASS,
                message=f"Hours correctly match units per the 54-hour rule ({calculated_total_hours} hours ÷ 54 = {expected_units:.2f} units).",
                section="Units & Hours",
            ))

        # Check for reasonable homework ratio (typically 2:1 for lectures)
        if lecture_hours > 0 and outside_hours > 0:
            homework_ratio = outside_hours / lecture_hours
            if homework_ratio < 1:
                results.append(ComplianceResult(
                    rule_id="UNIT-003",
                    rule_name="Outside-of-Class Hours Ratio",
                    category=ComplianceCategory.PCAH,
                    status=ComplianceStatus.WARN,
                    message=f"Outside-of-class hours ratio ({homework_ratio:.1f}:1) is low. Standard is 2:1 for lecture courses.",
                    section="Units & Hours",
                    recommendation="Consider if 2 hours of outside work per lecture hour is appropriate.",
                ))
            else:
                results.append(ComplianceResult(
                    rule_id="UNIT-003",
                    rule_name="Outside-of-Class Hours Ratio",
                    category=ComplianceCategory.PCAH,
                    status=ComplianceStatus.PASS,
                    message=f"Outside-of-class hours ratio ({homework_ratio:.1f}:1) is appropriate.",
                    section="Units & Hours",
                ))

        # Check that course has some instructional hours
        total_contact_hours = lecture_hours + lab_hours
        if total_contact_hours == 0:
            results.append(ComplianceResult(
                rule_id="UNIT-004",
                rule_name="Contact Hours Required",
                category=ComplianceCategory.GENERAL,
                status=ComplianceStatus.FAIL,
                message="Course must have contact hours (lecture and/or lab).",
                section="Units & Hours",
            ))
        else:
            results.append(ComplianceResult(
                rule_id="UNIT-004",
                rule_name="Contact Hours Required",
                category=ComplianceCategory.GENERAL,
                status=ComplianceStatus.PASS,
                message=f"Course has {total_contact_hours} contact hours.",
                section="Units & Hours",
            ))

        return results

    def _check_cb_codes(self, course: Dict[str, Any]) -> List[ComplianceResult]:
        """Check CB code requirements and dependencies."""
        results = []
        cb_codes = course.get("cb_codes", {})

        # Required CB codes for all courses
        required_codes = ["CB04", "CB05", "CB08", "CB09"]

        for code in required_codes:
            if code not in cb_codes or not cb_codes.get(code):
                results.append(ComplianceResult(
                    rule_id=f"CB-{code}",
                    rule_name=f"{code} Required",
                    category=ComplianceCategory.CB_CODES,
                    status=ComplianceStatus.FAIL,
                    message=f"{code} is required for state reporting.",
                    section="CB Codes",
                    citation="PCAH 8th Ed., Appendix A",
                ))
            else:
                results.append(ComplianceResult(
                    rule_id=f"CB-{code}",
                    rule_name=f"{code} Required",
                    category=ComplianceCategory.CB_CODES,
                    status=ComplianceStatus.PASS,
                    message=f"{code} is set to: {cb_codes.get(code)}",
                    section="CB Codes",
                ))

        # Check CB code dependencies
        # CB09 (SAM Priority) must be 'E' for non-vocational courses
        cb09 = cb_codes.get("CB09", "")
        top_code = course.get("top_code", "")

        # Check if TOP code indicates non-vocational (typically general ed codes)
        # Non-vocational TOP codes typically start with 15, 17, 19, 20, 22
        non_vocational_prefixes = ["15", "17", "19", "20", "22"]
        is_non_vocational = any(top_code.startswith(p) for p in non_vocational_prefixes) if top_code else False

        if is_non_vocational and cb09 and cb09 != "E":
            results.append(ComplianceResult(
                rule_id="CB-DEP-001",
                rule_name="CB09 SAM Code Dependency",
                category=ComplianceCategory.CB_CODES,
                status=ComplianceStatus.FAIL,
                message=f"Non-vocational course (TOP code {top_code}) must have CB09 = 'E', but has '{cb09}'.",
                section="CB Codes",
                citation="PCAH 8th Ed., CB09 Guidelines",
                recommendation="Set CB09 to 'E - Non-Occupational' for non-vocational courses.",
            ))
        elif cb09:
            results.append(ComplianceResult(
                rule_id="CB-DEP-001",
                rule_name="CB09 SAM Code Dependency",
                category=ComplianceCategory.CB_CODES,
                status=ComplianceStatus.PASS,
                message=f"CB09 value '{cb09}' is appropriate for this course.",
                section="CB Codes",
            ))

        # Check CB05 (Transfer Status) for credit courses
        cb04 = cb_codes.get("CB04", "")
        cb05 = cb_codes.get("CB05", "")

        if cb04 in ["A", "B"] and not cb05:  # Credit courses need transfer status
            results.append(ComplianceResult(
                rule_id="CB-DEP-002",
                rule_name="CB05 Transfer Status Required",
                category=ComplianceCategory.CB_CODES,
                status=ComplianceStatus.WARN,
                message="Credit course should specify transfer status (CB05).",
                section="CB Codes",
                recommendation="Set CB05 to indicate UC/CSU transferability.",
            ))
        elif cb05:
            results.append(ComplianceResult(
                rule_id="CB-DEP-002",
                rule_name="CB05 Transfer Status Required",
                category=ComplianceCategory.CB_CODES,
                status=ComplianceStatus.PASS,
                message=f"Transfer status (CB05) is set to: {cb05}",
                section="CB Codes",
            ))

        return results

    def _check_slos(self, slos: List[Dict[str, Any]]) -> List[ComplianceResult]:
        """Check Student Learning Outcomes requirements."""
        results = []

        # Minimum SLO count
        slo_count = len(slos)
        if slo_count < 3:
            results.append(ComplianceResult(
                rule_id="SLO-001",
                rule_name="Minimum SLOs Required",
                category=ComplianceCategory.SLO,
                status=ComplianceStatus.FAIL,
                message=f"Course has {slo_count} SLOs. Minimum required: 3.",
                section="Student Learning Outcomes",
                citation="PCAH 8th Ed., Section 3.2",
                recommendation="Add more Student Learning Outcomes to comprehensively cover course content.",
            ))
        else:
            results.append(ComplianceResult(
                rule_id="SLO-001",
                rule_name="Minimum SLOs Required",
                category=ComplianceCategory.SLO,
                status=ComplianceStatus.PASS,
                message=f"Course has {slo_count} SLOs.",
                section="Student Learning Outcomes",
            ))

        # Check for Bloom's Taxonomy distribution
        if slos:
            bloom_levels = [slo.get("bloom_level", "") for slo in slos]
            higher_order = ["Analyze", "Evaluate", "Create"]
            has_higher_order = any(level in higher_order for level in bloom_levels)

            if not has_higher_order:
                results.append(ComplianceResult(
                    rule_id="SLO-002",
                    rule_name="Higher-Order Thinking Skills",
                    category=ComplianceCategory.SLO,
                    status=ComplianceStatus.WARN,
                    message="No SLOs at higher cognitive levels (Analyze, Evaluate, Create).",
                    section="Student Learning Outcomes",
                    recommendation="Include at least one SLO requiring Analyze, Evaluate, or Create skills.",
                ))
            else:
                results.append(ComplianceResult(
                    rule_id="SLO-002",
                    rule_name="Higher-Order Thinking Skills",
                    category=ComplianceCategory.SLO,
                    status=ComplianceStatus.PASS,
                    message="SLOs include higher-order cognitive skills.",
                    section="Student Learning Outcomes",
                ))

        # Check SLO action verbs (should be measurable)
        weak_verbs = ["understand", "know", "learn", "appreciate", "be aware of"]
        for i, slo in enumerate(slos):
            outcome_text = slo.get("outcome_text", "").lower()
            for verb in weak_verbs:
                if outcome_text.startswith(verb) or f" {verb} " in outcome_text:
                    results.append(ComplianceResult(
                        rule_id=f"SLO-003-{i+1}",
                        rule_name="Measurable SLO Verbs",
                        category=ComplianceCategory.SLO,
                        status=ComplianceStatus.WARN,
                        message=f"SLO {i+1} may use a weak verb ('{verb}'). Use measurable action verbs.",
                        section="Student Learning Outcomes",
                        recommendation="Use Bloom's Taxonomy action verbs like: analyze, evaluate, apply, create, demonstrate.",
                    ))
                    break

        return results

    def _check_content(self, content_items: List[Dict[str, Any]], course: Dict[str, Any]) -> List[ComplianceResult]:
        """Check course content requirements."""
        results = []

        # Minimum content topics
        topic_count = len(content_items)
        if topic_count < 5:
            results.append(ComplianceResult(
                rule_id="CONTENT-001",
                rule_name="Minimum Content Topics",
                category=ComplianceCategory.CONTENT,
                status=ComplianceStatus.WARN if topic_count > 0 else ComplianceStatus.FAIL,
                message=f"Course has {topic_count} content topics. Recommended minimum: 5.",
                section="Course Content",
                recommendation="Add more content topics to represent the full scope of the course.",
            ))
        else:
            results.append(ComplianceResult(
                rule_id="CONTENT-001",
                rule_name="Minimum Content Topics",
                category=ComplianceCategory.CONTENT,
                status=ComplianceStatus.PASS,
                message=f"Course has {topic_count} content topics.",
                section="Course Content",
            ))

        # Check hours allocation
        if content_items:
            def to_decimal(val) -> Decimal:
                if val is None:
                    return Decimal("0")
                if isinstance(val, Decimal):
                    return val
                return Decimal(str(val))

            total_allocated = sum(to_decimal(item.get("hours_allocated", 0)) for item in content_items)
            lecture_hours = to_decimal(course.get("lecture_hours", 0))

            if total_allocated == 0:
                results.append(ComplianceResult(
                    rule_id="CONTENT-002",
                    rule_name="Content Hours Allocation",
                    category=ComplianceCategory.CONTENT,
                    status=ComplianceStatus.WARN,
                    message="No hours allocated to content topics.",
                    section="Course Content",
                    recommendation="Allocate hours to each content topic to show time distribution.",
                ))
            elif lecture_hours > 0:
                # Check if allocated hours roughly match total lecture hours
                semester_lecture_hours = lecture_hours * 18  # Weekly to semester
                if abs(total_allocated - semester_lecture_hours) > semester_lecture_hours * Decimal("0.2"):
                    results.append(ComplianceResult(
                        rule_id="CONTENT-002",
                        rule_name="Content Hours Allocation",
                        category=ComplianceCategory.CONTENT,
                        status=ComplianceStatus.WARN,
                        message=f"Allocated content hours ({total_allocated}) differ significantly from lecture hours ({semester_lecture_hours}).",
                        section="Course Content",
                        recommendation="Adjust content hours allocation to match total lecture hours.",
                    ))
                else:
                    results.append(ComplianceResult(
                        rule_id="CONTENT-002",
                        rule_name="Content Hours Allocation",
                        category=ComplianceCategory.CONTENT,
                        status=ComplianceStatus.PASS,
                        message=f"Content hours ({total_allocated}) appropriately allocated.",
                        section="Course Content",
                    ))

        return results

    def _check_requisites(self, requisites: List[Dict[str, Any]]) -> List[ComplianceResult]:
        """Check requisite compliance with Title 5 § 55003."""
        results = []

        # Check that prerequisites have content review documentation
        prerequisites = [r for r in requisites if r.get("type") == "Prerequisite"]

        for i, prereq in enumerate(prerequisites):
            content_review = prereq.get("content_review", "")
            if not content_review:
                results.append(ComplianceResult(
                    rule_id=f"REQ-001-{i+1}",
                    rule_name="Prerequisite Content Review",
                    category=ComplianceCategory.REQUISITES,
                    status=ComplianceStatus.WARN,
                    message=f"Prerequisite {i+1} lacks Content Review documentation.",
                    section="Requisites",
                    citation="Title 5 § 55003",
                    recommendation="Document how prerequisite skills match course entry requirements.",
                ))
            else:
                results.append(ComplianceResult(
                    rule_id=f"REQ-001-{i+1}",
                    rule_name="Prerequisite Content Review",
                    category=ComplianceCategory.REQUISITES,
                    status=ComplianceStatus.PASS,
                    message=f"Prerequisite {i+1} has Content Review documentation.",
                    section="Requisites",
                ))

        # If no prerequisites, that's fine - just note it
        if not prerequisites:
            results.append(ComplianceResult(
                rule_id="REQ-002",
                rule_name="Prerequisites Check",
                category=ComplianceCategory.REQUISITES,
                status=ComplianceStatus.PASS,
                message="No prerequisites defined (no Content Review required).",
                section="Requisites",
            ))

        return results

    def _check_ccn_alignment(self, course: Dict[str, Any]) -> List[ComplianceResult]:
        """
        Check CCN/AB 1111 (Common Course Numbering) compliance.

        Rules:
        - CCN-001: If CCN aligned, CB05 must be "A" (UC+CSU transferable)
        - CCN-002: If CCN aligned, course units should meet CCN minimum
        - CCN-003: If not CCN aligned, should have justification record

        Note: CCN-003 requires database access which isn't available in this
        synchronous method. The justification check is performed in the route
        handler instead.
        """
        results = []

        ccn_id = course.get("ccn_id")
        cb_codes = course.get("cb_codes", {}) or {}
        units = course.get("units")

        if ccn_id:
            # CCN-001: Check CB05 = "A" for CCN courses
            # Check both cases since JSON keys can vary
            cb05 = cb_codes.get("CB05") or cb_codes.get("cb05")
            if cb05 and cb05 != "A":
                results.append(ComplianceResult(
                    rule_id="CCN-001",
                    rule_name="CCN Transfer Status",
                    category=ComplianceCategory.CCN,
                    status=ComplianceStatus.FAIL,
                    message=f"CCN-aligned course has CB05='{cb05}' but must be 'A' (UC+CSU Transferable).",
                    section="CB Codes",
                    citation="AB 1111 (Common Course Numbering Act)",
                    recommendation="Update CB05 to 'A' to comply with CCN transfer requirements.",
                ))
            elif cb05 == "A":
                results.append(ComplianceResult(
                    rule_id="CCN-001",
                    rule_name="CCN Transfer Status",
                    category=ComplianceCategory.CCN,
                    status=ComplianceStatus.PASS,
                    message=f"CCN-aligned course ({ccn_id}) has correct CB05='A' for UC+CSU transfer.",
                    section="CB Codes",
                ))
            else:
                # CB05 not set yet - warn
                results.append(ComplianceResult(
                    rule_id="CCN-001",
                    rule_name="CCN Transfer Status",
                    category=ComplianceCategory.CCN,
                    status=ComplianceStatus.WARN,
                    message=f"CCN-aligned course ({ccn_id}) should have CB05='A' set.",
                    section="CB Codes",
                    citation="AB 1111 (Common Course Numbering Act)",
                    recommendation="Set CB05 to 'A' for CCN-aligned courses.",
                ))

            # CCN-002: Check minimum units (if we have the CCN minimum in the data)
            # Note: The CCN minimum units would need to be passed in or looked up
            # For now, we check if the ccn_minimum_units is provided in course_data
            ccn_minimum_units = course.get("ccn_minimum_units")
            if ccn_minimum_units and units:
                if units < ccn_minimum_units:
                    results.append(ComplianceResult(
                        rule_id="CCN-002",
                        rule_name="CCN Minimum Units",
                        category=ComplianceCategory.CCN,
                        status=ComplianceStatus.WARN,
                        message=f"Course units ({units}) below CCN minimum ({ccn_minimum_units}).",
                        section="Units",
                        citation="C-ID Descriptor requirements",
                        recommendation=f"Consider increasing units to at least {ccn_minimum_units} to meet CCN requirements.",
                    ))
                else:
                    results.append(ComplianceResult(
                        rule_id="CCN-002",
                        rule_name="CCN Minimum Units",
                        category=ComplianceCategory.CCN,
                        status=ComplianceStatus.PASS,
                        message=f"Course units ({units}) meet or exceed CCN minimum ({ccn_minimum_units}).",
                        section="Units",
                    ))

        else:
            # No CCN alignment - check for justification
            # CCN-003: Warn if no justification exists
            # Note: This check requires database access, so we just provide a generic warning
            # The actual justification lookup is done in the compliance route handler
            has_justification = course.get("has_ccn_justification", False)
            if not has_justification:
                results.append(ComplianceResult(
                    rule_id="CCN-003",
                    rule_name="CCN Justification Required",
                    category=ComplianceCategory.CCN,
                    status=ComplianceStatus.WARN,
                    message="Course is not CCN-aligned. Per AB 1111, a justification should be provided.",
                    section="CCN Alignment",
                    citation="AB 1111 (Common Course Numbering Act)",
                    recommendation="Submit a CCN non-match justification explaining why this course does not align with a C-ID standard.",
                ))
            else:
                results.append(ComplianceResult(
                    rule_id="CCN-003",
                    rule_name="CCN Non-Match Justification",
                    category=ComplianceCategory.CCN,
                    status=ComplianceStatus.PASS,
                    message="Non-CCN course has documented justification on file.",
                    section="CCN Alignment",
                ))

        return results


# Singleton instance
compliance_service = ComplianceService()
