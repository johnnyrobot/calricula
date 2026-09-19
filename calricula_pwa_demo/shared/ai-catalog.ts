/**
 * The one copy of the regulatory data the AI path is allowed to use.
 *
 * Three consumers need it and they do not share a module system: the Worker
 * (`worker/catalog.ts`), the browser (`src/lib/ai/schemas.ts`), and the
 * evaluation rubric (`scripts/ai-eval-fixtures.mjs`). The first two import
 * this file directly. The third cannot — `npm run ai:evaluate` runs
 * `scripts/ai-evaluate.mjs` under plain Node, which cannot import TypeScript —
 * so it keeps a hand-written copy that `src/lib/ai/eval-catalog-parity.test.ts`
 * pins to this file, field for field.
 *
 * Field names are the ones that cross the wire (`sourceTitle`, not `title`),
 * so the Worker returns a citation by spreading a source rather than renaming
 * its fields on the way out.
 *
 * These are demo fixtures, not an authoritative extract of Title 5 or the
 * PCAH. Each source carries the checksum of the document it was quoted from.
 */

export interface TopCodeEntry {
  readonly code: string;
  readonly title: string;
}

/**
 * Ordered, because the Worker renders it into a system prompt and a stable
 * prompt is what makes model evaluation reproducible. The map below is derived
 * from this list so the two can never disagree.
 */
export const AI_TOP_CODES = [
  { code: "1701.00", title: "Mathematics, General" },
  { code: "1501.00", title: "English" },
  { code: "0707.00", title: "Computer Information Systems" },
  { code: "0401.00", title: "Biological Sciences" },
  { code: "2001.00", title: "Psychology, General" },
  { code: "0505.00", title: "Business Administration" },
  { code: "1002.00", title: "Art" },
  { code: "2205.00", title: "History" },
  { code: "1905.00", title: "Chemistry, General" },
  { code: "1230.00", title: "Nursing" },
  { code: "1012.00", title: "Applied Photography" },
  { code: "0956.00", title: "Manufacturing Technology" },
  { code: "2101.00", title: "Sociology" },
  { code: "0835.00", title: "Child Development/Early Care and Education" },
  { code: "1301.00", title: "Communication Studies" },
  { code: "1901.00", title: "Physical Sciences, General" },
  { code: "2202.00", title: "Political Science" },
  { code: "2203.00", title: "Economics" },
  { code: "0502.00", title: "Accounting" },
  { code: "0701.00", title: "Information Technology, General" },
] as const satisfies readonly TopCodeEntry[];

export type TopCodeValue = (typeof AI_TOP_CODES)[number]["code"];

export const AI_TOP_CODE_CATALOG = Object.fromEntries(
  AI_TOP_CODES.map(({ code, title }) => [code, title]),
) as Record<TopCodeValue, string>;

export interface ComplianceSource {
  readonly sourceTitle: string;
  readonly sourceSection: string;
  readonly excerpt: string;
  readonly url: string;
  readonly checksum: string;
}

export const AI_COMPLIANCE_SOURCE_PACK = {
  "title5-course-standards": {
    sourceTitle: "California Code of Regulations, title 5, section 55002",
    sourceSection: "§ 55002(a)(1)(C), Units",
    excerpt:
      "Course outlines of record shall record the total number of hours in each instructional category specified in governing board policy.",
    url: "https://govt.westlaw.com/calregs/Document/I825A4A90BB1811F0933DFD2696D93541?contextData=%28sc.Default%29&originationContext=documenttoc&transitionType=CategoryPageItem&viewType=FullText",
    checksum:
      "sha256:839c8f4f1bd8d44f1f78137ccf4a812a9c59b819a2da959326bac342e52c78e6",
  },
  "title5-credit-hour": {
    sourceTitle: "California Code of Regulations, title 5, section 55002.5",
    sourceSection: "§ 55002.5(a), Credit Hour Definition",
    excerpt:
      "One credit hour of community college work (one unit of credit) shall require a minimum of 48 semester hours of total student work.",
    url: "https://govt.westlaw.com/calregs/Document/IECE98DC0507C11EE80669BF4F3976CB1?contextData=%28sc.Default%29&originationContext=documenttoc&transitionType=CategoryPageItem&viewType=FullText",
    checksum:
      "sha256:f8a5ef427582c25688603a32a1c537282d6337730da147672af76425bb8a6e03",
  },
  "pcah-current-edition": {
    sourceTitle:
      "California Community Colleges Program and Course Approval Handbook, 8th Edition",
    sourceSection: "p. 44, Criteria for the Course Outline of Record",
    excerpt:
      "The Chancellor’s Office review and chaptering processes require the submission of a COR that meets the standards for courses established in Title 5, § 55002.",
    url: "https://www.cccco.edu/-/media/CCCCO-Website/docs/curriculum/program-course-approval-handbook-8th-edition.pdf",
    checksum:
      "sha256:ecbcd9235e013f4b823d5d6605ca1681b9425955f28ce89a20848be7f8d766ee",
  },
  "ccn-current-guidance": {
    sourceTitle: "California Education Code section 66725.5",
    sourceSection: "§ 66725.5(a)(2), Common Course Numbering System",
    excerpt:
      "ensure that comparable courses across all community colleges have the same course number.",
    url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=66725.5.&lawCode=EDC",
    checksum:
      "sha256:bb02261c81bbc8d2fd535db18876b40f482e7cfa9bb74d6d3e3a1bf0a510a0a6",
  },
} as const satisfies Record<string, ComplianceSource>;

export type ComplianceSourceId = keyof typeof AI_COMPLIANCE_SOURCE_PACK;

/**
 * Typed as a non-empty tuple so the browser can hand it straight to
 * `z.enum(...)` without re-asserting the shape.
 */
export const AI_COMPLIANCE_SOURCE_IDS = Object.keys(
  AI_COMPLIANCE_SOURCE_PACK,
) as [ComplianceSourceId, ...ComplianceSourceId[]];
