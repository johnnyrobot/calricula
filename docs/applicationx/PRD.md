# ApplicationX product requirements

Version: 0.4 | Date: 2026-09-20 | Status: Draft for review

Companions: [Technical specification](TECHNICAL-SPEC.md) and
[source inventory](SOURCE-INVENTORY.md).

## 1. Product purpose

ApplicationX helps colleges connect educational programs to employer needs and
helps students reach the careers those programs prepare them for. Faculty,
career-services and CTE staff, employers, and (later) students collaborate
through scoped workspaces assisted by evidence-grounded agents.

The initial complete workflow is: select a program, inspect its curriculum and
regional opportunity, identify potential employers, collect structured feedback,
review a possible skills gap, and export an evidence-backed action to the
college's curriculum or program-review process.

Every claim the product makes about an employer, an occupation or a curriculum
carries its source, its observation time and its coverage limits. ApplicationX
does not answer from incomplete or failed sources as if they were complete.

## 2. Product boundaries and decisions

ApplicationX is a **separate companion app**, as selected by the owner. It may
share libraries and identity infrastructure with other applications, but each app
retains its records, membership decisions, and authorization.

### Staff interface inside Calricula

Staff use an **Employer & Career Collaboration** navigation item and a matching
action on each program page. ApplicationX's workspace opens inside Calricula's
existing navigation and visual layout. ApplicationX retains its own backend and
records. This is the planned primary Calricula staff experience.

Program entry carries the selected college, program and revision; global entry
shows an authorized workspace selector. The context stays visible. Switching
programs starts a fresh workspace context. Returning to curriculum editing
preserves the program/revision. Calricula has no unsaved-change guard today; the
entry point is the program detail page, and ApplicationX must not add
navigation that bypasses a save flow.

Configured shared sign-in avoids a second login for embedded staff, while
ApplicationX checks its own workspace membership. Missing access or mappings
produce explicit setup/access-request states, never automatic sharing.
Employers and (later) students use standalone ApplicationX. Staff may open the
same authorized workspace there as well; both views use the same records.

Use Calricula's light-only luminous styling and accessible navigation. An
ApplicationX outage shows an inline status without disabling curriculum editing.
Calipar keeps its data/workflow integration; embedding in Calipar is not added.
See the binding [embedded interface design](EMBEDDED-INTERFACE.md).

| System | Owns | Exchanges with ApplicationX |
| --- | --- | --- |
| ApplicationX | Employer records, postings, feedback, workspace discussions, tasks, evidence, agent runs, permitted student sharing | Evidence packages, source references, proposed actions |
| Calricula | Course/program revisions, objectives, requirements, approval state, labor-market lookups | Approved curriculum and explicitly shared drafts; reviewable curriculum proposals; wage and projection data by occupation |
| Calipar | Program reviews, action plans, strategic mappings, resource requests | Review context explicitly shared by staff; evidence packages and proposed actions |
| State and federal references | Occupation codes, regional labor-market indexes, grant frameworks | Read-only ingestion of published data with release period and geography |

Copying an identity between systems never grants an equivalent role automatically.
ApplicationX cannot approve a COR, certify transfer eligibility, register a student,
or decide an employer's hiring outcome.

## 3. Users and access

| Audience | Main jobs | Default visibility |
| --- | --- | --- |
| Faculty/program chair | Validate skills mappings, work with employers, propose improvements | Assigned program workspaces and shared institutional evidence |
| Career-services/CTE staff | Discover employers, manage contact history, coordinate work-based learning | Assigned employer and program records |
| Employer guest | Describe job needs, review shared competencies, offer opportunities | Only individually shared workspace resources and threads |
| Reviewer/dean | Review evidence and proposed actions | Assigned review scope; no blanket access to private student conversations |
| Organization administrator | Configure membership, source access, retention and budgets | Administrative scope; content access remains explicit and audited |
| Signed-in student (P3) | Follow opportunities, share a profile with a program, receive interview and placement support | Own private space plus explicitly joined shared spaces |

There is no anonymous or public principal with access to workspace records.

## 4. Research translated into product behavior

The owner's three source documents (product benefits deck, benefit summary, and
the Tier-1 college use case) define the intended outcomes: a continuously
maintained, prioritized regional employer list for each program; contacts and
relationship history per employer; visibility of postings and of the
qualifications they ask for; employer participation in advisory review; and,
later, student-facing career support and alumni follow-up.

The [research report](research/2026-09-20-applicationx-deep-research.md)
tests those outcomes against current sources. Its findings shape scope here:

- No licensed feed is assumed. Employer discovery covers configured sources and a
  stated geography; a complete employer list or a complete posting history is
  never promised (§8).
- Employer contacts are personal information under California law. Contact
  records carry their source, consent/sharing state and suppression flags, and
  no enrichment vendor is used without a documented registration check (§8).
- The California Perkins V needs assessment and Title 5 advisory-committee rules
  define evidence colleges must keep (rosters, agendas, sign-in lists, labor-
  market tests). Capturing that evidence is a candidate requirement (§11).

## 5. Core user journeys

### J1. Employer discovery and program evidence

1. Staff select an exact college, program revision, geographic scope and occupations.
2. The app builds a cited brief from curriculum and labor-market data.
3. Staff add known employers or request discovery from configured sources.
4. Each match shows location, relevant roles, evidence, last observation, and why
   it appears. AI-inferred matches remain labeled pending validation.
5. Staff review an outreach draft; external delivery requires an approved action.
6. Employer feedback links to specific tasks, skills, objectives and assessments.
7. Staff export a reviewed evidence package to Calricula or Calipar.

### J2. Collaborative advisory review

A chair invokes the assistant in a program thread. It compares scoped employer
feedback and postings with the approved curriculum, drafts an agenda and possible
gaps, and links each claim to evidence. People correct or confirm the findings,
assign owners, and approve an action package. Private staff notes do not appear
in employer-visible summaries. Concurrent edits produce a reviewable conflict.

### J3. Ongoing monitoring

Staff define a source set, program, schedule, notification audience and budget.
The bot checks for posting, curriculum or agreement changes, deduplicates them and
posts a bounded internal digest. Every monitor has a visible owner, last-run
status and pause/cancel control. A failed source is reported separately from
"nothing changed."

### J4. Student and employer connection (P3)

A student who has opted in shares a profile with a program workspace. Staff
help the student prepare for a specific opportunity using employer-confirmed
competencies from the advisory loop, record interview outcomes with the
student's consent, and keep a placement or alumni record the student can revoke.

## 6. Functional requirements

| ID | Requirement | Release |
| --- | --- | --- |
| AX-01 | Organization/workspace membership, resource-level sharing, invitations and revocation | P1 |
| AX-02 | Versioned source registry, coverage/freshness states, immutable evidence references | P1 |
| AX-03 | Regional labor-market lookups using explicit SOC and geography joins, with release period and limits on every value | P1 |
| AX-04 | Workspace inside Calricula, coordinated staff sign-in, explicit program context, independent authorization and standalone entry | P1 foundation; P2 collaboration |
| AX-05 | Employer/location/contact records, sourced postings, explainable relevance ranking and outreach drafts | P2 |
| AX-06 | Skills/tasks evidence graph, human mapping review and curriculum impact queries | P2 |
| AX-07 | Threads, mentions, reviewed summaries, tasks, meeting evidence and action packages | P2 |
| AX-08 | Durable bounded agent runs, delegated roles, monitoring, cancellation and approval audit | P2 |
| AX-09 | Calricula and Calipar evidence import/export; revision-safe proposed changes | P2 |
| AX-10 | Occupation references (O*NET, CareerOneStop) and regional indexes consumed as published, with attribution | P2 |
| AX-11 | Opt-in student/employer contact, applications, interview support, placement and alumni follow-up | P3 |
| AX-12 | Competency pilot measures and pathway constraints supporting program review | P3 |
| AX-13 | Provider-independent model/tool boundaries, diagnostics, accessibility and evaluation gates | All |

## 7. Evidence and assistant behavior requirements

- Retrieve quantitative facts through structured connectors. Use the model to
  explain results, not invent wages, growth rates, employer sizes or postings.
- Show evidence cards and tables with accessible links. A graph visualization is
  optional; every relationship must also be readable as a table or narrative.
- Distinguish stated required/desired skills, AI-extracted interpretations, and
  employer-confirmed competencies.
- Show partial, stale, unavailable and unconfigured sources separately. Never
  answer "no employers" or "no postings" from an incomplete or failed source.
- Support English and Spanish for employer- and student-facing material; other
  languages are best effort.

## 8. Employer and agent boundaries

Discovery covers the configured sources and geographic scope; the app cannot
promise a complete list of all employers or two years of all job postings.
Historical coverage starts at each source's retained history or authorized import.
Employer ranking exposes relevance factors; it is not a hiring-probability score.

Employer contact records are personal information. Each record stores its
source, the date it was obtained, consent/sharing state, an opt-out flag and a
suppression flag honored by every outreach feature. Vendor-sourced contacts are
added only after the vendor's data-broker registration has been checked and
deletion obligations flow down by contract. Outreach messages carry a physical
address and an opt-out mechanism by default.

Agents may perform approved read workflows, prepare drafts and create internal
tasks within their delegated scope. Sending outreach, changing sharing, uploading
private content to a new provider, or exporting a proposed change across apps
requires a concrete action review or a previously configured bounded authorization.
Approval is bound to exact content, recipients, resource revision and expiration.
Imported content cannot grant agent permissions or change its instructions.

## 9. Success measures and acceptance

These are proposed release targets, not measured results.

| Measure | Acceptance definition |
| --- | --- |
| Source contract fidelity | 100% of required fixture cases preserve scope, IDs, coverage, source time and structured errors |
| Citation support | At least 95% of factual claims in a brief supported by the cited record; critical numeric claims 100% |
| Isolation | Zero unauthorized records, counts, names or citations in cross-tenant/guest/student negative tests |
| Agent action integrity | All mutating actions have matching authority; duplicate deliveries/retries do not duplicate effects |
| Staff usefulness | In a pilot of at least 10 program briefs, staff judge at least 8 useful after inspecting evidence; record edits and time spent |
| Work reduction | Compare median time to a reviewed brief against the same staff's manual baseline; target a 25% reduction, not assumed benefit |
| Accessibility | WCAG 2.2 AA acceptance across primary tasks using automated checks plus keyboard and screen-reader review |

Hiring, earnings, learning quality and time-to-competency are later outcomes.
Record denominators, follow-up windows and source quality; do not infer causal
impact from application usage or regional wage statistics.

## 10. Delivery phases

### P1 — foundation (implemented)

Identity, organizations, workspaces, program mappings, the Calricula host-context
handshake, row-level security, the connector contract with the Calricula
labor-market connector, the shared workspace UI package and the standalone
entry. Ships AX-01 through AX-04.

### P2 — employer collaboration, graph and cross-app proposals

Ship AX-05 through AX-10. Prove one end-to-end employer-feedback-to-review
action. Expose these capabilities through both the embedded staff view and
standalone ApplicationX, using the same backend records and permissions.
Use manual employer entries and approved public pages first; licensed
directories and posting feeds are not prerequisites for this pilot. No Neo4j
dependency is required.

### P3 — private student workflows

Add opt-in student/employer sharing, placement follow-up and competency pilots.
Sources needing authorization stay visibly disabled until configured. Lack of
credentials is not a reason to claim completion.

### P4 — scale evaluation

Consider a dedicated Neo4j projection, specialized orchestration or additional
channels only after measured needs.

## 11. Non-goals and unresolved launch choices

The draft does not specify automated hiring, autonomous curriculum approval,
registration, grading, transcript evaluation, unrestricted web scraping, a
public question-answering surface, generic shell access for agents, or
automatic credential compression.

Before each affected phase, the product owner selects the pilot institution and
programs, operational source licenses, infrastructure provider, monitoring budget,
and retention policy. The institution supplies permissions for private student
data. The current safe default is manual sources and synthetic private-data tests.
No SIS vendor or supported production SIS connector has been established.

Candidate requirements raised by the research report, not yet accepted:

- **CTE compliance evidence** — advisory-committee roster with Title 5 §55601
  role categories, structured meeting records with sign-in capture, and an
  export matching the California Perkins V needs-assessment framework.
- **Posting source** — a governed feed (NLx Research Hub or Lightcast) once its
  terms and cost are known; until then, monitoring is a daily digest over
  configured sources.
- **Employer roster source** — a licensed directory by NAICS and geography.
