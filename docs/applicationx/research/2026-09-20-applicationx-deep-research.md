# ApplicationX — deep-research report

Date: 2026-09-20 | Status: research findings, not a decision record
Method: `/deep-research` workflow (5 search angles, 25 sources fetched, 123 claims
extracted, 25 verified by 3-vote adversarial review → 21 confirmed, 4 refuted) plus
a direct read of the three owner documents and the repo/sibling-repo artifacts.

**How to read the labels.** Every statement is tagged by where it comes from:

- **[OWNER]** — the three source-of-truth documents (`Application Benefits.pptx`,
  `ApplicationX Benefit Summary.docx`, `Inputs and Outputs - Standard College Use Case.docx`).
- **[REPO]** — what has been designed or built (`docs/applicationx/*`, `plans/*`,
  and the sibling `applicationx` repository).
- **[EXT ✓]** — external claim that survived 3-vote verification.
- **[EXT ?]** — external claim extracted from a fetched source but *not* put
  through verification (budget cap); treat as plausible, cite with care.
- **[EXT ✗]** — claim that was refuted; listed so nobody re-asserts it.

---

## 1. Executive summary (for college stakeholders)

ApplicationX's thesis — colleges must get into the placement business and need a
tool that finds regional employers, keeps those relationships alive, and feeds
employer demand back into curriculum — is well supported by current evidence.
Public confidence in higher ed fell from 57% (2015) to 38% (2026), Americans trust
community colleges more than four-year schools, and only 56% of recent associate
graduates say their degree was important to reaching career goals vs. 80% of
bachelor's graduates [EXT ?, Lumina-Gallup 2026]. On the employer side, 93% of
community-college leaders grade employers "B" or lower on collaboration, only one in
four employers say they communicate hiring needs transparently, and only 11% of
educators report employers willing to set hiring targets [EXT ?, HBS/AACC
*Partnership Imperative*, 2020–21 survey data]. Strada's review of 109 college–employer
partnership proposals found three-quarters included curriculum alignment with
employer priorities and over 80% work-based learning [EXT ?] — the exact loop
ApplicationX proposes to instrument.

Four findings should shape the pitch and the roadmap:

1. **The differentiator is real and uncontested.** No product in the competitive
   set does *employer-side discovery + CTE advisory-board workflow + curriculum
   feedback into a Course-Outline-of-Record tool*. Handshake, Symplicity, 12twenty
   and Lightcast Career Coach are student/career-center tools; Salesforce, Slate and
   Element451 are admissions CRMs; Steppingblocks is alumni analytics; Riipen is
   experiential projects; Workforce Connect (closest analogue) is a K-12 CTE
   partnership CRM with no AI discovery or COR loop [EXT ✓/?].

2. **The Tier-1 output "two years of job postings per employer" has no cheap,
   legal path.** Indeed retired its Publisher API in 2023 [EXT ?]; LinkedIn's Job
   Posting API is write-only and closed to new partners [EXT ✓]; Adzuna's free key
   is capped at 2,500 calls/month and its ToS forbids ongoing college/government
   use without written consent [EXT ✓]; CareerOneStop's Jobs API now sits behind the
   NASWA NLx Research Hub governance board [EXT ✓]; scraping is barred by contract
   even where the CFAA does not apply (hiQ v. LinkedIn, $500K + permanent
   injunction) [EXT ?]. Lightcast's Job Postings API has the right facets (NAICS 2–6,
   SOC 2–5, O*NET, company, county/MSA, education/experience, skills) but no zip
   facet, and its pricing/gating is unverified [EXT ✓ facets; EXT ✗ gating]. The
   repo already scoped this down honestly (PRD §8: "cannot promise … two years of
   all job postings"). The pitch deck should say the same.

3. **The grant-reporting benefit is the most under-designed and the most
   concretely specifiable.** The CCCCO Perkins V CLNA (memo WED 25-80) defines
   exactly the LMI tests (regional median-of-median wage; 2024–2029 growth AND
   openings ≥ regional median) and the stakeholder-engagement evidence (agendas,
   sign-in sheets, participant name/institution/title/phone/email kept on file, not
   published) a tool must capture [EXT ✓]. Nothing in the PRD/spec mentions Perkins,
   Strong Workforce or advisory-committee evidence. Gainful Employment as the owner
   docs describe it is ending: FVT/GE stays in force only to June 30 2027 and is
   replaced by STATS/Earnings Accountability on July 1 2027 [EXT ?, FSA].

4. **Employer contacts are now a regulated asset in California.** The Delete Act's
   DROP platform has been live since Jan 1 2026; registered data brokers must poll it
   every 45 days from Aug 1 2026 and propagate deletions to service providers;
   CalPrivacy has already fined B2B lead-gen vendors (Growbots, UpLead) for
   non-registration [EXT ✓/?]. Any vendor-enriched "owner / HR director / supervisor"
   roster needs registration checks, deletion flow-down and suppression lists in the
   data model — none of which the spec's `Contact` record carries today.

---

## 2. Gap analysis — owner vision vs. repo build (Q1)

### 2.1 Where the build stands (2026-09-20)

[REPO] P1 (foundation) is implemented in the sibling repo: identity (Logto OIDC,
dev tokens), organizations / workspaces / program mappings, the Calricula
host-context handshake, row-level security, the in-process connector contract
with the Calricula LMI connector (`backend/app/connectors/lmi.py`, filters by
SOC), the `@johnnyrobot/workspace-ui` package (0.2.0) and the standalone app.
There are no `Employer`, `Contact` or `JobPosting` tables yet (P2 task 1 in the
roadmap). Calricula hosts the staff route behind `APPLICATIONX_EMBED_ENABLED`.

### 2.2 Scope decision recorded 2026-09-20

[OWNER] Slide 10: "What are our initial goals? Develop **Level 1 Prototype for
College Use**." The I/O doc defines that Level 1 / Tier 1 use case as employer
discovery by NAICS + zip + SOC, contacts, posting history, qualification extraction,
and an outreach template.

[REPO] Earlier drafts (v0.3) had carried a general-purpose student-information
chatbot alongside the employer work; it absorbed most early engineering while the
Tier-1 use case sat at P2. On 2026-09-20 the owner removed that surface and all of
its sources from the product. The PRD (v0.4) now covers employer collaboration
only, requirements are renumbered AX-01–AX-13, and P2 (employer collaboration) is
the next phase. The coverage matrix below uses the v0.4 numbering.

### 2.3 Coverage matrix

Status key: **Built** (code exists) · **Designed** (PRD/spec/plan, with phase) ·
**Partial** (some aspect designed) · **Absent** (no artifact) · **Scoped down**
(designed, but repo explicitly narrows the promise).

| # | Owner benefit / input / output | Source | Repo artifact | Status | Notes |
|---|---|---|---|---|---|
| **College benefits** | | | | | |
| C1 | Continuously updated list of **ALL** employers in region | pptx s4; docx ¶1 | PRD J1 step 3; AX-05 (P2); PRD §8 | **Scoped down** (P2) | PRD §8: "cannot promise a complete list of all employers." P2 unlocks with *manual* entries + approved public pages; no directory source selected. |
| C2 | AI-ranked prioritization of employers most likely to hire | pptx s4; docx ¶2 | AX-05 "explainable relevance ranking"; spec §12 Employers row | **Scoped down** (P2) | Repo forbids a "hiring-probability score"; ranking must expose factors. Consistent with owner intent if the deck stops saying "most likely to hire." |
| C3 | CRM-like tools to create/maintain employer relationships | pptx s4; docx ¶3 | AX-05 contacts + AX-07 threads/tasks/meeting evidence | **Designed** (P2) | No pipeline/stage model, no reminders, no activity timeline specified. |
| C4 | List of key individuals at each employer (VP HR, supervisors) | pptx s4; docx ¶4; I/O output 2 | Spec §4 `Contact` ("sourced professional contacts; consent/sharing state") | **Partial** (P2) | No enrichment provider, no data-broker registration check, no suppression list, no Delete-Act deletion flow-down (see §5). |
| C5 | Continuously comb Internet for employer news, date-stamped | pptx s4; docx ¶5 | PRD J3 monitoring; spec §6 "Employer postings: daily configured monitor" | **Scoped down** (P2/AX-08) | "Daily" not "continuous"; no news-source connector named; egress allowlist model means sources must be pre-approved. |
| C6 | Asynchronous communication college ↔ employers ↔ (students) | pptx s4; docx ¶8, ¶10 | AX-07 threads with employer guest (P2); AX-11 student↔employer (P3) | **Designed** (P2/P3) | Strong. Employer guest sees only shared resources. |
| C7 | Recruit employers for annual advisory meetings; asynchronous continuous input; collect data for program review/accreditation | pptx s4; docx ¶8 | PRD J2 (agenda drafting, gap findings, action packages); AX-07 meeting evidence; AX-09 export to Calipar | **Partial** (P2) | Covers the *meeting*, not the *recruitment* or the *roster*. No Title 5 §55601 composition tracking, no attendance/sign-in capture, no "one meeting per year" evidence (§5). |
| C8 | Collect/analyze LMI to create and improve programs | pptx s5; docx ¶9 | AX-03 (P1); `lmi.py` connector | **Built (partial)** | SOC-filtered wages/projections via Calricula. No COE, no EDD projections by region, no Perkins in-demand/high-wage tests. |
| C9 | Notify dean/chairs/faculty/students of postings **the moment** they are published | pptx s5; docx ¶11 | Spec §6: "No promise of instant notifications or complete posting history" | **Scoped down** (P2) | Honest given source access (see §3). Lightcast Career Coach also only refreshes monthly [EXT ✓], so "daily digest" would still lead the market. |
| C10 | Help staff help students edit resumes, respond to applications, prep interviews | pptx s5; docx ¶12 | AX-11 "interview support" (P3) | **Partial** (P3) | One phrase. Market caution: >300 applications per hire, 62% of employers say they reject uncustomized AI resumes [EXT ?] — a generic AI resume feature adds to the flood. |
| C11 | Follow up after interviews; learn why not hired | pptx s5; docx ¶13 | AX-11 "placement and alumni follow-up" (P3) | **Partial** (P3) | No interview-outcome record or employer feedback-to-student loop specified. |
| C12 | Identify gaps in employer performance metrics → college consulting (needs assessment, contract ed) | pptx s5, s7; docx ¶7 | — | **Absent** | No artifact anywhere. Also the weakest external support: employers "do not see colleges as experts in this area" (owner's own slide 6). |
| C13 | Maintain relationships with graduates who land jobs; foundation/advancement benefit | pptx s5; docx ¶14–15 | AX-11 alumni follow-up (P3) | **Partial** (P3) | Foundation/advancement use is absent. Steppingblocks already sells this to advancement offices [EXT ✓]. |
| C14 | Grant applications + reports for Perkins, Strong Workforce, Gainful Employment | pptx s5; docx ¶16 | — | **Absent** | No mention of Perkins, SWP, CLNA, LaunchBoard, NOVA or GE in PRD/spec/plans. See §5 for what would be needed. |
| C15 | Import student data from SIS/CRM | docx ¶10 | PRD §11: "No SIS vendor or supported production SIS connector has been established"; inventory S4 "SIS import: unsupported" | **Deferred** (P3 gate) | FERPA school-official exception terms not yet in the spec [EXT ?]. |
| C16 | Engage with SHRM, Education at Work, JFF, Riipen | docx ¶17 | — | **Absent** | Riipen is now inside a Google.org/ACCT initiative embedding employer projects in coursework at ~14–20 colleges [EXT ✓]; an integration target, not a feature. |
| C17 | Employer contacts for guest speakers, apprenticeships, internships, WBL | docx ¶6; pptx s9 | Users table "coordinate work-based learning"; `Opportunity` record | **Partial** (P2) | No WBL activity model (placement type, hours, supervisor, paid/unpaid). Workforce Connect models job shadows/internships/advisory boards by pathway [EXT ?]. |
| C18 | Collect/report post-program employment & wage data | pptx s5 | AX-11 (P3) | **Partial** (P3) | External reality: SWP employment/earnings metrics come from EDD UI wage match + CTEOS survey via LaunchBoard, not from college tools [EXT ?]. Reframe as *engagement inputs*, not outcome data. |
| **Employer benefits** | | | | | |
| E1 | Discover college programs, even outside local region | pptx s7 | — | **Absent** | No employer-facing program discovery view (by occupation/skill → programs statewide). Calricula's public catalog is the nearest existing surface. |
| E2 | Build trust with a source of qualified candidates | pptx s7 | — (outcome) | n/a | Outcome, not feature. |
| E3 | Find/hire "good match" candidates faster, lower hiring cost | pptx s7 | AX-11 opt-in student/employer contact (P3); PRD §2 "cannot decide an employer's hiring outcome" | **Partial** (P3) | Candidate matching is not designed. |
| E4 | Time-efficient way to qualify candidates with faculty and express curriculum wishes | pptx s7 | J1 step 6, J2, AX-07, AX-09 (P2) | **Designed** (P2) | The best-covered employer benefit and the product's differentiator. |
| E5 | Discover that faculty/instructional designers can help with training needs | pptx s7 | — | **Absent** | Same as C12. |
| **Student benefits** | | | | | |
| S1 | Earlier engagement with career center / career-path selection | pptx s9 | — | **Absent** | No student-facing career exploration; interest assessment and program→career mapping are Lightcast Career Coach's core [EXT ✓]. |
| S2 | Career development services online | pptx s9 | J4 student/employer connection (P3) | **Partial** (P3) | Interview and placement support only; no general career services. |
| S3 | Job boards + LMI for ANY area of the U.S. | pptx s9 | AX-03 LMI (P1); job boards unlicensed | **Partial** | LMI yes; job boards no. |
| S4 | Communication tools with faculty and employers | pptx s9 | AX-11 (P3) | **Designed** (P3) | |
| S5 | Find apprenticeships, internships, WBL | pptx s9 | `Opportunity` record (P2) | **Partial** | See C17. CareerOneStop/Apprenticeship.gov feeds not inventoried. |
| **Tier-1 inputs (I/O doc)** | | | | | |
| I1 | Known employers entered by staff | I/O | P2 "manual employer entries approved as the source" | **Designed** (P2) | Matches. |
| I2 | NAICS codes (via NAICS identification tools) | I/O | Spec §4 namespaces/crosswalks (SIC vs NAICS preserved) | **Partial** | Namespace only; no NAICS lookup tool or employer-by-NAICS source. |
| I3 | Region by zip codes (district/county/state/nation) | I/O | Spec §4 "A ZIP code is a geographic filter, not a Job Zone" | **Partial** | Filter concept only. Lightcast has no zip facet [EXT ✓]; Census ZBP has zip totals but no names [EXT ?]. Plan county/MSA translation. |
| I4 | Job titles, SOC codes, O*NET Job Zones 1–5 | I/O | `lmi.py` SOC filter (built); spec Job Zone distinction; AX-10 occupation references (P2) | **Partial** | SOC built; O*NET Web Services (Job Zones, crosswalk, CC BY 4.0) planned in P2. |
| I5 | Pull job data from Indeed/LinkedIn "even if we have to pay a license fee" (open question) | I/O | Inventory S2: "LinkedIn and Indeed have no lawful read path" | **Answered: no** | See §3 — both closed; licensed aggregators are the only path. |
| **Tier-1 outputs (I/O doc)** | | | | | |
| O1 | Employer database with names, addresses, contact info | I/O | `Employer`/`EmployerLocation` (P2) | **Designed** (P2) | No roster source (Data Axle/D&B) selected. |
| O2 | Individual contacts incl. owner/president/HR director/supervisors | I/O | `Contact` (P2) | **Partial** | See C4. |
| O3 | All job openings from each employer over last ~2 years | I/O | Spec §6 + PRD §8 disclaim | **Scoped down** | Correct call; see §3. Owner's "(two?)" already signals uncertainty. |
| O4 | Min/desired qualifications extracted from postings | I/O | `JobPosting` required/desired skill claims; `POSTING_REQUESTS_SKILL`; extracted/inferred/confirmed claim status | **Designed** (P2) | Well specified; needs a posting source to be real. |
| O5 | Template letter/email introducing the program, requesting a call | I/O | AX-05 outreach drafts; Approval bound to content hash/recipients/expiry; PRD §8 address + opt-out by default | **Designed** (P2) | Added to PRD v0.4 §8 after this research. |

### 2.4 Promised benefits with no design at all

C12/E5 (employer performance-gap consulting), **C14 (Perkins / Strong Workforce / GE
reporting)**, C16 (SHRM/EAW/JFF/Riipen engagement), foundation/advancement use of
alumni data (C13), and any employer-oriented program-discovery view (E1). Of these,
only C14 is worth designing now — it is concretely specifiable (§5) and is the
benefit CTE deans will ask about first.

### 2.5 Other drift worth noting

- **Vocabulary.** Owner docs say "advisory board" and "program review"; the repo
  routes advisory outcomes to *Calipar* (program review) and curriculum proposals to
  *Calricula*. Fine, but the two-year CTE review under Ed Code §78016 and the Title 5
  §55601 committee are only named in PRD v0.4 §11 as a candidate requirement.
- **Students in the loop.** Owner docs treat direct student↔employer contact as
  "perhaps"/opt-in; the repo makes it P3 with explicit consent and no employer access
  to raw records. Consistent.
- **Naming.** Slide 11's candidates (CareerCollab, WorkforceCollab, PathSync…) are
  unresolved; the repo ships "Employer & Career Collaboration" as the nav label.
- **Data-source honesty is a repo strength.** PRD §7–8 and spec §6 refuse to answer
  "no employers" from an incomplete source and require dated observations. Keep this
  when writing stakeholder material.

## 3. Data-source feasibility (Q2)

| Source | What it provides | Access / licensing | Cost | Legal risk | Verdict | Conf. |
|---|---|---|---|---|---|---|
| **Indeed** | Posting search | Publisher API retired 2023; affiliate program closed to new publishers since Oct 2022; only a display widget and NDA-gated enterprise partnerships remain | Reported six-figure minimums | Scraping prohibited by ToS | **Not viable** for a prototype | [EXT ?] blog; verify at docs.indeed.com |
| **LinkedIn Job Posting API** | *Write* channel for ATSs to push jobs to LinkedIn; no read of others' postings | Partner-gated; "currently not accepting new partnerships"; redirected to Apply Connect | — | User Agreement bars scraping; hiQ settled with $500K + permanent injunction | **Not viable** | [EXT ✓] |
| **Adzuna API** | Search, regional vacancy counts, top companies, salary histogram/history, categories; no per-employer archive | Self-serve key; default 25/min, 250/day, 1,000/wk, 2,500/mo; ToS limits college/government use beyond three permitted uses to a 14-day trial and requires written consent for ongoing use; "Jobs by Adzuna" attribution | Commercial licence unpublished | Low if licensed | **Prototype feed only**; needs written licence for production | [EXT ✓] |
| **Lightcast Job Postings API** | 2010→present de-duplicated postings; facets NAICS 2–6, SOC 2–5, O*NET, company, county/MSA/city/state, min/max education & experience, certifications, skills; `posting_intensity`; **no zip facet** | Contract; OAuth. Gating specifics (10 rps, 10/100/1,000 posting-sample caps) were **refuted 1-2** — unverified | Unpublished | Low | **Best fit for O3/O4** if affordable; ask COE whether the CCC system licence can be extended | [EXT ✓ facets] / [EXT ✗ gating] |
| **NLx Research Hub (NASWA)** | Daily/historical job-posting data via API or monthly files; successor to CareerOneStop Jobs API | Request reviewed by NLx Research Hub Governance Board | Unpublished | Low | **Most plausible governed path** for a public college; open question on cost/latency | [EXT ✓] |
| **CareerOneStop Web APIs** (non-jobs) | ~21 API families: occupations w/ OEWS wages, skills gaps (O*NET), certifications, licenses, training (IPEDS), workforce boards; LMI API is deliberately narrow | Royalty-free; registration; 36-month expiry; per-page attribution to USDOL ETA + MN DEED; geocodes may not be stored | $0 | Low | **Use** for occupation/skills/licence context | [EXT ✓] |
| **O*NET Web Services** | Job Zones 1–5, SOC crosswalk, skills/tasks | CC BY 4.0 with attribution | $0 | Low | **Use** for I4 | [EXT ?] |
| **BLS OEWS / QCEW / projections** | Wages, employment, industry employment by county | Open data | $0 | Low | **Already wired** via Calricula | [REPO] |
| **EDD LMID (CA)** | CA projections, wages, Open Data Portal | Open | $0 | Low | **Use**; named in CLNA framework | [EXT ?] |
| **CCC Centers of Excellence (COE)** | Regional supply/demand, high-growth occupations, sector/district profiles, employer surveys; nine regional centers matching SWP consortia; uses Lightcast under a system licence | CCCCO-funded technical assistance for colleges | $0 to colleges (fee status not explicitly stated) | None | **Ingest, don't recompute**; also the Perkins in-demand/high-wage index source | [EXT ✓] |
| **Cal-PASS Plus LaunchBoard (SWP)** | Enrollments, completions, employment in field (CTEOS), earnings change, living-wage attainment; disaggregations incl. Perkins economically-disadvantaged flag; ~1–2 yr lag | Public dashboards | $0 | None | **Link/ingest** for C14/C18; state already does wage match | [EXT ?] |
| **Census CBP / ZBP API** | Establishment counts, employment, payroll by NAICS 2–6 at county; zip-level totals only (all-sector, size classes); no names | Public domain | $0 | None | **Use** for "how many employers of type X in region Y"; cannot supply named list | [EXT ?] |
| **Data Axle Reference Solutions (ex-ReferenceUSA)** | ~94M business records with NAICS/SIC, size, sales, executive name/title | Government/library channel; many CA college libraries already license it; library terms typically bar bulk export | Custom quote | Medium (contacts are PI under CPRA) | **Most plausible named-employer roster**; needs a separate data-licence/API agreement, not library piggyback | [EXT ?] |
| **D&B, Google Places, OpenCorporates, state licence data** | Roster/geo alternatives | — | — | — | **Not researched** in this run | — |
| **Apollo / ZoomInfo / Clearbit-HubSpot / Hunter** | Contact enrichment (HR directors, supervisors) | Each vendor's ToS not researched | — | **High**: CA Delete Act registration ($6,000–6,600/yr; $200/day fines; CalPrivacy has fined B2B lead-gen vendors); DROP deletion flow-down from Aug 1 2026; CPRA's B2B-contact exemption expired Jan 1 2023 | **Only with vendor registration verified at the CalPrivacy registry and contractual deletion flow-down**; decide whether ApplicationX itself is a broker if it shares contacts across colleges (unresolved) | [EXT ✓ law] / [EXT ?] |
| **Jooble, Google Jobs, USAJobs, JobsPikr, Coresignal** | Aggregators / scraping marketplaces | — | — | JobsPikr/Coresignal are scraping-derived; contract risk | **Not researched**; treat scraping-derived vendors as out of policy (PRD §11 "unrestricted web scraping" is a non-goal) | — |

**Bottom line for Tier 1:** inputs I1–I4 are deliverable at $0 (BLS/EDD/COE/O*NET/
CareerOneStop/Census) plus a Data Axle-class roster licence. Outputs O1/O4/O5 are
deliverable. **O2 (named individuals) and O3 (2-year posting history) are the two
outputs that require paid, governed sources and carry legal duties** — price NLx
Research Hub and Lightcast (via COE) before promising either.

---

## 4. Competitive and market landscape (Q3)

| Product / org | What it does today | Pricing (if public) | Overlap with ApplicationX | Differentiation left to ApplicationX | Conf. |
|---|---|---|---|---|---|
| **Handshake** | Campus-recruiting marketplace, 1M+ employers; no AI advising, mock interviews or outcome tracking (per a competitor's comparison) | Not public | Student job board (S3) | Employer discovery, advisory workflow, COR loop | [EXT ?] vendor-authored |
| **Symplicity** | Career-center back office: appointments, employer contact mgmt, fairs, postings, caseloads; no proactive outreach | Pro ~$329/mo; enterprise $20K–100K+/yr | Contact database (C3/C4) | Discovery/ranking, LMI, curriculum feedback | [EXT ?] |
| **12twenty** | NACE/US News outcomes reporting, employer recruiting CRM, benchmarking; survey-based outcomes | Not public | C13/C18 | Same | [EXT ?] |
| **Lightcast Career Coach** | Student-facing: interest assessment, program→career via CIP–O*NET crosswalk, 32K-skill library, local postings + vetted partner postings via Employer Portal; postings refreshed monthly, LMI quarterly; widget/API embed | Not public | S1, S3, C9 (partly) | No employer discovery, CRM or advisory features; daily beats monthly | [EXT ✓] |
| **Lightcast (data)** | The de facto licensed posting/skills dataset | Contract | — | Likeliest **supplier**, not competitor | [EXT ✓/?] |
| **Steppingblocks** | 150M+ career paths, 25M+ employer profiles; Digital Career Counselor, Graduate Outcomes, Alumni/Advancement; customers are large 4-year universities; **record-level alumni downloads claim refuted** | Not public | C13 | No employer CRM/outreach | [EXT ✓ positioning; ✗ downloads] |
| **Riipen** | Experiential-learning marketplace; 44K+ employers, 700+ academic partners; in Google.org/ACCT 3-yr initiative (announced Jan 27 2026, launch fall 2026, 14–20 colleges) | Not public | C17/S5 | Partner, not competitor (named in owner docs) | [EXT ✓] |
| **Workforce Connect** | CTE employer-partnership CRM for **K-12 districts**: advisory boards, WBL tracking by pathway, Perkins/WIOA grant reports; unlimited users, no seat licences | Not public | Closest analogue to C3/C7/C14/C17 | Community-college segment, AI discovery, LMI ranking, COR feedback loop | [EXT ?] |
| **Salesforce Education Cloud** | Admissions/advancement CRM | $87/user/mo (nonprofit), Unlimited $145, Agentforce $375 (checked Jul 2026) | Generic CRM only | Everything domain-specific | [EXT ?] |
| **Technolutions Slate** | Admissions CRM | ~$30K/yr licence, most ~$50K; 6–12 mo implementation | Generic CRM | Same | [EXT ?] |
| **Element451** | Admissions CRM | Custom ($20K–40K+/yr reported) | Generic CRM | Same | [EXT ?] |
| **EnrollmentRX, Jenzabar** | Not ranked among leading higher-ed CRMs in the reviewed comparison | — | — | — | [EXT ?] |
| **PlanStreet, LinkedIn Recruiter, Indeed, Visier, Crunchr, Stellic, JobsEQ, Pathful, Tallo** | **Not researched** in this run | — | — | — | — |
| **US Chamber Foundation TPM** | Employer-collaborative demand planning; ~400 Academy grads, 30+ industries, 36 states; evidence is self-reported case studies; relies on employers pooling proprietary demand data | — | Partner model for C7 | A tool cannot scrape what TPM asks employers to share voluntarily | [EXT ?] |
| **Strada, JFF, Education at Work, CredLens, SHRM Foundation, Smith Family Fdn, Full Scale Learning** | Not individually researched beyond the Strada partnership-trends report | — | Funders/conveners | — | — |
| **CCC Centers of Excellence** | In-system regional LMI supplier (see §3) | $0 | C8 | Consume, don't compete | [EXT ✓] |

**Market signals** (all [EXT ?] unless marked):

- Public confidence in higher ed 57% → 38% (2015→2026); community colleges trusted
  more than four-year schools, mostly on cost; ~70% of employers say new grads need
  moderate or substantial additional training (Lumina-Gallup 2026).
- 93% of CC leaders grade employers B or lower on collaboration; only 25% of
  employers report transparent hiring-need communication; over half could not
  identify the skills they were hiring for (HBS/AACC, survey data 2020–21 — dated).
- Applications per hire tripled 2021→2024 and stayed >300 through 2025; candidates
  ~50% less likely to get an interview than five years ago (Ashby 2026). **The AI
  attribution in the search snippet is not in the press release** — do not cite Ashby
  for "AI resumes."
- 80% of hiring managers say they can spot AI resumes; 62% say uncustomized AI resumes
  are more likely rejected (Resume Now vendor survey — low rigor).
- Strada's skeptical takeaway: the bottleneck is employer capacity and college data
  infrastructure, not employer *discovery*; fewer than half of learners get paid
  internships. A tool that only finds employers may not move placement outcomes.
- Workforce Pell for short-term programs is now law (ACCT framing) — tailwind for
  CTE-aligned tooling.

---

## 5. Compliance and grant-reporting fit (Q4)

### 5.1 Perkins V (California, CCCCO)

[EXT ✓] Memo WED 25-80 (Nov 24 2025) + WED 26-34 (May 4 2026): all 72 districts
submitted a 2026-27 local application + CLNA (PDF) via NOVA by May 29 2026, CBO-
certified, approved by regional monitors by July 1 2026; CLNA updated every two
years (next cycle 2028-29). Program eligibility = two of three:

- **High-skill**: any approved CE program (trivially met).
- **High-wage**: occupation ≥ regional "median of the median" wage (2024 wage data),
  or program earnings ≥10% above regional average (SWP "Attained a Living Wage").
- **In-demand**: projected growth 2024–2029 in region **and** annual openings ≥
  regional median (Occupation-in-Demand index and/or CLNA).

CLNA has six elements; Element #6 is "Alignment to LMI" with named sources: COE
research, EDD LMI, MIS Data Mart/Core Indicators, Data Vista, program review/
accreditation, SWP dashboard. Appendix C lists as acceptable evidence: "real-time
job postings data from online search engines, possibly with analytics support from a
data firm", "input from business and industry representatives", and "alumni
employment and earnings outcomes … or a follow-up survey of alumni". Stakeholder
consultation must include workforce boards and a range of regional businesses;
evidence = meeting agendas, notes, sign-in sheets, participant lists with **name,
institution, title, phone, email**, kept on file for monitoring (the CLNA itself is
public — no private data in it). State Plan for §131/132 programs: at least **one
advisory committee meeting per year** [EXT ?].

### 5.2 Strong Workforce Program

[EXT ?] LaunchBoard SWP metrics: enrollments, skills gains, completions (incl.
third-party credentials), transfer, employment in field (CTEOS), median earnings
change, living-wage attainment; disaggregated by race/gender/age and a Perkins
economically-disadvantaged flag; geographies statewide → macroregion → microregion →
district → college. Sources are MIS, EDD UI wage file, CTEOS, NSC, DAS — **not
college tools**. 60% local / 40% regional-consortia funding with four-year regional
plans requiring employer and workforce-board collaboration.

### 5.3 Gainful Employment / FVT

[EXT ?, FSA Knowledge Center] 2023 FVT/GE rules remain in effect through June 30
2027 (not rescinded despite 2025 litigation); final legacy reporting cycle due Oct 1
2026; replaced July 1 2027 by **STATS (Student Tuition and Transparency System) and
Earnings Accountability** final regulations (published July 1 2026, OBBBA-driven;
early-implementation guidance Aug 11 2026). Institutional reporting = completers
lists + program cost/debt data; earnings computed by ED. **Reframe the owner's "GE
reporting" benefit around STATS/earnings-premium, and note that no college tool
supplies the earnings side.**

### 5.4 Title 5 / Ed Code / ACCJC

[EXT ?, ASCCC 2019 practices paper] Title 5 §55601: governing board appoints a CTE
advisory committee with representatives of the public (disadvantaged populations),
students, teachers, business, industry, college administration and the EDD field
office. Ed Code §78016: every CTE program reviewed every two years for (1) documented
labor-market demand, (2) no unnecessary duplication, (3) effectiveness measured by
employment and completion. Title 5 §55130(b)(8)(E): new CTE program approval needs
advisory-committee recommendation + local curriculum approval + Regional Consortium
recommendation. ACCJC Standard II items 14/16 (2014 numbering; **2024 standards
renumbered — verify**) require CTE graduates meet employment standards and regular
evaluation of program currency.

### 5.5 Privacy and accessibility

- **FERPA** (SIS import, C15): vendor receives education records only under the
  school-official exception (34 CFR 99.31(a)(1)(i)(B)) — outsourced institutional
  function, direct control, purpose limitation, no redisclosure [EXT ?, ED PTAC].
  Combining student PII with employer outreach (C10/C11/E3) needs explicit consent.
- **CCPA/CPRA + Delete Act** (C4/O2): see §3. B2B contact exemption gone since 2023;
  DROP live; broker registration and 45-day polling from Aug 1 2026 [EXT ✓].
- **CAN-SPAM** (O5): if an outreach email's primary purpose is commercial, it needs
  accurate headers, a physical postal address, a conspicuous opt-out honored within
  10 business days, and ad identification; penalties up to ~$53K per email; sender
  liability cannot be contracted away [EXT ✓ elements]. **Blanket applicability to
  college→employer outreach was refuted 0-3** — an advisory-board or partnership
  invitation is arguably non-commercial. Design: include address + opt-out +
  suppression by default (cheap), don't claim CAN-SPAM *requires* it.
- **WCAG 2.2 AA**: already a PRD §9 acceptance row and a Calricula-wide obligation.
  Not researched further.

### 5.6 Data-capture checklist (what the app must store to deliver C7/C14)

| Field group | Why | Repo today |
|---|---|---|
| Advisory committee roster: member, organization, **role category per Title 5 §55601** (business, industry, EDD, student, faculty, admin, public), term dates | §55601 composition; CLNA stakeholder evidence | `Contact` has no role category; candidate requirement in PRD v0.4 §11 |
| Meeting record: date, agenda (artifact), minutes/notes, **sign-in list** with name/institution/title/phone/email, recommendations, linked curriculum actions | CLNA evidence "kept on file"; State Plan ≥1/yr; Ed Code §78016 | AX-07 "meeting evidence" (P2) — unstructured |
| Per-program occupation set (SOC) with region; regional median wage; 2024–2029 growth; annual openings vs regional median; source + release date | Perkins high-wage / in-demand tests; CLNA Element #6 | `lmi.py` returns wages/projections; no thresholds, no COE index |
| Posting-evidence summary per program/region with source, date range, count, coverage limits | CLNA Appendix C "real-time job postings data" | `JobPosting` history coverage (P2) |
| Employer engagement log (contacts, outreach, WBL offers) with dates | CLNA stakeholder engagement; SWP regional collaboration | AX-07 threads (P2) |
| Alumni follow-up: opt-in, employer, title, date; **never** wage data | Appendix C "follow-up survey of alumni"; FERPA | AX-11 (P3) |
| Privacy flags: public-CLNA-safe vs. on-file-only; broker source + registry check; DROP suppression; email opt-out | Delete Act, CAN-SPAM, CLNA public-doc caution | Added to PRD v0.4 §8 and spec §4 `Contact` |
| Export: CLNA Element #6 narrative + evidence list; NOVA-ready PDF attachment | C14 | Absent (AX-09 exports go to Calricula/Calipar only) |

---

## 6. Recommended roadmap changes (P2 onward)

Ordered by leverage. Each is a proposal for the owner, not a decision.

1. **Start P2 with a P2-lite slice.** The owner's stated Level-1 goal is the
   Tier-1 employer use case. Deliver `Employer` / `EmployerLocation` / `Contact` /
   `JobPosting` migrations + manual entry + the outreach-draft approval flow
   (roadmap P2 tasks 1 and 4) first. Everything in P2-lite works with $0 sources.
2. **Add AX-14 "CTE compliance evidence" (P2).** Advisory roster with §55601 role
   categories, structured meeting records with sign-in capture, ≥1/yr indicator,
   CLNA Element #6 export. This turns C7 and C14 from Absent/Partial into Designed
   and is the feature deans will pay for. Reference WED 25-80 in the spec.
3. **Encode the Perkins tests in `lmi.lookup`.** Add COE Occupation-in-Demand /
   EDD regional projections as a source; return high-wage and in-demand booleans with
   the release date and region. Keep the "ingest, don't recompute" rule.
4. **Decide the posting source now, with two quotes.** Ask COE whether the CCC
   Lightcast system licence extends to ApplicationX, and file an NLx Research Hub
   request. Until one is signed, spec §6's "daily monitor / no history promise" stays
   and the deck's "moment they are published" line changes to "daily digest".
5. **Extend `Contact` for California law.** Fields: source vendor + registry-check
   date, consent/sharing state (exists), DROP suppression flag, email opt-out +
   timestamp, on-file-only vs. public-safe. Add a phase gate: "no enrichment vendor
   without verified CalPrivacy registration and deletion flow-down in contract".
   Resolve whether cross-college contact sharing makes ApplicationX itself a broker.
6. **Employer roster source.** Evaluate Data Axle government-channel API terms
   (many CCC libraries already licence the reference product) and Census ZBP for
   denominators; drop "ALL employers" from stakeholder material in favor of
   "employers in configured sources, with coverage shown".
7. **Reframe three deck benefits.** (a) GE → STATS/earnings accountability (July
   2027); (b) post-program employment/wage → engagement inputs, since LaunchBoard/EDD
   own outcomes; (c) resume help → verified employer-sourced signals, not generic AI
   resume generation (the market is flooded).
8. **Cut or park C12/E5 (employer performance-gap consulting)** until there is a
   pilot employer asking for it; no evidence and no design.
9. **Employer-facing program discovery (E1).** An occupation/skill → programs
   (statewide) view over Calricula's approved catalog; consider for P2.
10. **Riipen as an integration target (C16/C17)**, timed to the fall-2026 ACCT
    cohort; add a `WorkBasedLearning` activity model in P3.

---

## 7. Verification notes

**Refuted (do not re-assert):**
- Lightcast OAuth scope `postings:us`, 10 rps default, 10/100/1,000 posting-sample
  caps (1-2).
- CAN-SPAM applies to college→employer B2B outreach as a blanket matter (0-3).
- Steppingblocks Graduate Outcomes provides record-level alumni employment downloads (1-2).

**Unverified in this run (budget cap; sourced but not 3-voted):** everything tagged
[EXT ?] above — notably Indeed API status (single practitioner blog), Census ZBP
detail, Data Axle terms, FSA STATS timeline, LaunchBoard sources, ASCCC/Title 5
quotes, ED PTAC FERPA guidance, all pricing figures, Gallup/HBS/Ashby/Strada numbers.

**Not researched at all:** D&B, Google Places, OpenCorporates, state licence data,
Apollo/ZoomInfo/Clearbit/Hunter ToS, Jooble, Google Jobs, USAJobs, JobsPikr,
Coresignal; PlanStreet, LinkedIn Recruiter, Visier, Crunchr, Stellic, JobsEQ,
Pathful, Tallo; JFF, Education at Work, CredLens, SHRM Foundation; ACCJC 2024
standards numbering; WCAG beyond the existing obligation.

**Time-sensitive:** LinkedIn partner moratorium (page dated 2026-06-03) may lift;
Adzuna ToS undated; Delete Act enforcement posture evolving; Perkins dates are the
closed 2026-27 cycle; Lightcast facet list from pipeline 2026-06.

---

## 8. Sources

Primary / official
- LinkedIn Job Posting API overview (Microsoft Learn, li-lts-2026-03) — https://learn.microsoft.com/en-us/linkedin/talent/job-postings/api/overview?view=li-lts-2026-03
- Lightcast Job Postings API docs — https://docs.lightcast.dev/apis/job-postings
- Adzuna API ToS / overview / regional / historical — https://developer.adzuna.com/docs/terms_of_service ; https://developer.adzuna.com/overview
- CareerOneStop Web API, registration, jobs-API update — https://www.careeronestop.org/Developers/WebAPI/web-api.aspx ; …/registration.aspx ; …/jobs-api-updates.aspx
- NASWA NLx Research Hub — https://www.naswa.org/national-labor-exchange/nlx-research-hub
- CCC Centers of Excellence — https://coeccc.net/ ; https://coeccc.net/about/
- CCCCO Workforce & Economic Development — https://www.cccco.edu/About-Us/Chancellors-Office/Divisions/Workforce-and-Economic-Development
- CCCCO memo WED 25-80 (Perkins V 2026-27 CLNA guidance) — https://www.cccco.edu/-/media/CCCCO-Website/docs/memo/wed-25-80-perkins-2026-27-clna-guidance-memo-and-framework-a11y.pdf
- CCCCO Perkins V CLNA framework template — https://www.cccco.edu/-/media/CCCCO-Website/Files/Workforce-and-Economic-Development/Perkins-V/perkins-v-clna-framework-template-a11y.pdf
- Cal-PASS Plus LaunchBoard SWP — https://www.calpassplus.org/LaunchBoard/SWP.aspx
- FSA Knowledge Center FVT/GE — https://fsapartners.ed.gov/knowledge-center/topics/financial-value-transparency-and-gainful-employment-information
- CalPrivacy DROP — https://privacy.ca.gov/drop/ ; enforcement advisory Dec 17 2025 — https://cppa.ca.gov/announcements/2025/20251217.html ; Cal. Civ. Code §1798.99.82
- FTC CAN-SPAM compliance guide — https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- Census CBP/ZBP API — https://www.census.gov/data/developers/data-sets/cbp-zbp/cbp-api.html
- Data Axle Reference Solutions (government) — https://www.referenceusagov.com/
- ED PTAC vendor FAQ (FERPA) — https://studentprivacy.ed.gov/sites/default/files/resource_document/file/Vendor%20FAQ.pdf
- ASCCC Effective Practices for CTE Advisory Committees (2019) — https://www.sdccd.edu/docs/ISPT/workforce/docs/ASCCC-EffectivePractices-AdvisoryCommittees2019.pdf
- Lightcast Career Coach — https://lightcast.io/solutions/education/career-coach
- Steppingblocks — https://www.steppingblocks.com/ ; /career-services
- ACCT × Google.org × Riipen initiative — https://www.acct.org/news/national-initiative-will-equip-community-colleges-embed-real-world-employer-projects-workforce
- Lumina-Gallup 2026 — https://news.gallup.com/poll/702284/college-students-grads-strong-career-value-degree.aspx
- HBS/AACC Partnership Imperative — https://www.hbs.edu/faculty/Pages/item.aspx?num=63379
- Ashby 2026 Talent Trends (PR Newswire) — https://www.prnewswire.com/news-releases/new-data-from-ashby-reveals-surge-in-applications-rising-selectivity-and-shifting-recruiter-workloads-302765846.html
- Strada partnership trends — https://stradaeducation.org/report/trends-in-employer-partnerships-with-community-colleges/
- US Chamber Foundation TPM case-study analysis — https://www.uschamberfoundation.org/workforce/talent-pipeline-management-a-case-study-analysis-of-best-practices-and-common-challenges

Secondary / blog (lower weight)
- ZwillGen on hiQ v. LinkedIn — https://www.zwillgen.com/alternative-data/hiq-v-linkedin-wrapped-up-web-scraping-lessons-learned/
- JobsPipe on the Indeed Publisher API — https://jobspipe.dev/blog/indeed-publisher-api
- Prentus career-services software roundup — https://prentus.com/blog/best-career-services-software-for-colleges-and-universities
- SaaS CRM Review, higher-ed CRMs — https://saascrmreview.com/crm-for-higher-education/
- Workforce Connect — https://workforceconnect.com/resources/supporting-cte-excellence-through-workforce-partnership-management
- Resume Now AI applicant report — https://www.resume-now.com/job-resources/careers/ai-applicant-report

Repo artifacts read
- `docs/applicationx/README.md`, `PRD.md`, `TECHNICAL-SPEC.md` (§4, §6, §13), `SOURCE-INVENTORY.md`, `plans/2026-09-17-p1b-p4-roadmap.md`
- `applicationx/backend/app/connectors/lmi.py`; grep of `applicationx/backend/app` for employer/posting code
- Owner documents (text extracts, not committed): `/tmp/appx-src/*.txt`

---

## 9. Companion artifacts

- **Proposal deck (web page):** `docs/applicationx/research/deck/index.html` — single-file,
  self-contained, styled on johnnyphung.com's design tokens (Inter + JetBrains Mono,
  indigo accent, dotted-grid hero, stat band, numbered mono kickers, finding→solution
  work-rows). axe-core WCAG 2.2 AA scan: 0 violations. `--text-faint` darkened from the
  site's `#767B85` (4.24:1) to `#676C76` to meet 4.5:1; status greens/ambers likewise.
- **Web-claims appendix:** `2026-09-20-web-claims-appendix.txt` — every search result and
  every extracted claim (verified and unverified) from the workflow, with evidence quotes.
- **Workflow result:** `2026-09-20-workflow-result.txt` — the harness's raw findings,
  refuted list, caveats, open questions and source table.
- **Owner-document text extracts:** kept *outside* the public repo at
  `session/20260917_144623/applicationx-research/` (untracked), per SOURCE-INVENTORY §7.
