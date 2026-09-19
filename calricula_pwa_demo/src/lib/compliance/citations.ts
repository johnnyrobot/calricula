import type { CitationId, SourceCitation } from "./types";

/**
 * Reader-facing source metadata. These links are deliberately data rather than
 * embedded prose so every rendered rule can expose its authority and version.
 *
 * Regulatory checks and local/demo heuristics are distinguished on each
 * ComplianceResult; a citation does not turn a heuristic into a legal finding.
 */
export const CITATION_PACK = {
  "title5-55002": {
    id: "title5-55002",
    shortLabel: "Title 5 § 55002",
    title: "Standards and Criteria for Courses",
    issuingBody: "California Office of Administrative Law",
    jurisdiction: "California",
    kind: "regulation",
    locator: "5 CCR § 55002",
    url: "https://govt.westlaw.com/calregs/Document/I825A4A90BB1811F0933DFD2696D93541?viewType=FullText",
    verifiedOn: "2026-07-29",
  },
  "title5-55002-5": {
    id: "title5-55002-5",
    shortLabel: "Title 5 § 55002.5",
    title: "Credit Hour Definition",
    issuingBody: "California Office of Administrative Law",
    jurisdiction: "California",
    kind: "regulation",
    locator: "5 CCR § 55002.5(a)-(b)",
    url: "https://govt.westlaw.com/calregs/Document/IECE98DC0507C11EE80669BF4F3976CB1?viewType=FullText",
    verifiedOn: "2026-07-29",
    notes:
      "One credit requires at least 48 semester hours of total student work; 96 or more hours requires at least two units.",
  },
  "title5-55003": {
    id: "title5-55003",
    shortLabel: "Title 5 § 55003",
    title:
      "Policies for Prerequisites, Corequisites and Advisories on Recommended Preparation",
    issuingBody: "California Office of Administrative Law",
    jurisdiction: "California",
    kind: "regulation",
    locator: "5 CCR § 55003",
    url: "https://govt.westlaw.com/calregs/Document/I62075ED34C6911EC93A8000D3A7C4BC3?viewType=FullText",
    verifiedOn: "2026-07-29",
  },
  "pcah-9": {
    id: "pcah-9",
    shortLabel: "PCAH 9th Ed.",
    title: "2026 Program and Course Approval Handbook",
    issuingBody: "California Community Colleges Chancellor's Office",
    jurisdiction: "California",
    kind: "official-handbook",
    locator:
      "Part II, Sections 1-2: credit course criteria, COR, and credit-hour calculations",
    url: "https://www.cccco.edu/-/media/CCCCO-Website/docs/2026programandcourseapprovalhandbook131a11y.pdf",
    version: "9th edition, July 2026",
    verifiedOn: "2026-07-29",
  },
  "education-code-66725-5": {
    id: "education-code-66725-5",
    shortLabel: "Education Code § 66725.5",
    title: "Common Course Numbering System",
    issuingBody: "California Legislature",
    jurisdiction: "California",
    kind: "statute",
    locator: "California Education Code § 66725.5",
    url: "https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202120220AB1111",
    verifiedOn: "2026-07-29",
    notes:
      "AB 1111 established the student-facing common course numbering framework. Current implementation dates and later amendments should be checked before production use.",
  },
  "ccn-templates": {
    id: "ccn-templates",
    shortLabel: "CCN Templates",
    title: "Course Outline of Records Submission: Common Course Numbering Templates",
    issuingBody: "California Community Colleges Chancellor's Office",
    jurisdiction: "California",
    kind: "official-guidance",
    locator: "Common Course Numbering Templates",
    url: "https://www.cccco.edu/About-Us/Chancellors-Office/Divisions/Educational-Services-and-Support/course-outline-of-records-submission",
    verifiedOn: "2026-07-29",
    notes:
      "Template-specific requirements, not fuzzy matching, are authoritative for an adopted CCN course.",
  },
  "cb-data-elements": {
    id: "cb-data-elements",
    shortLabel: "CCCCO CB Data Elements",
    title: "Curriculum and Instruction Unit: Data Element Dictionary",
    issuingBody: "California Community Colleges Chancellor's Office",
    jurisdiction: "California",
    kind: "official-guidance",
    locator: "CB03, CB09, and related course data elements",
    url: "https://www.cccco.edu/About-Us/Chancellors-Office/Divisions/Educational-Services-and-Support/%20What-we-do/Curriculum-and-Instruction-Unit/",
    verifiedOn: "2026-07-29",
  },
} as const satisfies Readonly<Record<CitationId, SourceCitation>>;

export function getCitation(id: CitationId): SourceCitation {
  return CITATION_PACK[id];
}
