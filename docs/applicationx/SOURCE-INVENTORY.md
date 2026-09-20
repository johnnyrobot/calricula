# ApplicationX source inventory and integration coverage

Version: 0.4 | Date: 2026-09-20 | Status: Verified pointers plus proposed sources

Every data family ApplicationX may read is listed here with an evidence level,
a phase and a coverage obligation. The machine-readable copy is
`connectors/data_families.yaml` in the ApplicationX repository; a family is
"implemented" only when it links to a registered operation with fixtures.

## 1. Evidence levels

- **Verified:** the source, its access path and its limits were inspected in the
  Calricula code or an official published document. This does not establish
  configured credentials, live health or complete parity.
- **Proposed:** the ApplicationX feature, exchange or data provider does not yet
  exist or has not been contracted.
- **Unsupported:** excluded on purpose (remote mutation, no lawful access path,
  no vendor established).

## 2. Calricula curriculum and labor-market data (S1) — verified, P1

Calricula owns course and program revisions, objectives, requirements, units,
hours, CB codes and approval state, and exposes labor-market lookups.

- [Course LMI fields](../../backend/app/models/course.py)
- [California LMI client](../../backend/app/services/lmi_client.py)
- [BLS client](../../backend/app/services/bls_client.py) and
  [QCEW client](../../backend/app/services/qcew_client.py)
- [Course LMI and export routes](../../backend/app/api/routes/courses.py)

| Family | ApplicationX use | Coverage obligation | Status |
| --- | --- | --- | --- |
| Program/course revisions | Host context carries the approved revision; drafts only when explicitly shared | Every claim bound to a revision | Verified; exchange package proposed (P2) |
| Occupational wages and projections (EDD, BLS OEWS) | `lmi.lookup` by SOC through Calricula's public `/api/lmi/search` route | Release period, geography and limits on every value | Implemented, tested |
| Industry employment (QCEW) | Regional denominators by NAICS and county | Reference period on every value | Proposed (P2) |

## 3. Employer records (S2) — proposed, P2

ApplicationX-owned. Manual entry is the first source; licensed sources are
gated on contracts.

| Family | Source | Coverage obligation | Status |
| --- | --- | --- | --- |
| Employers, locations, contacts | Staff entry; approved public employer pages | Source and obtained-at on every record; contact consent/opt-out/suppression flags | Proposed (P2 first) |
| Employer directory by NAICS and geography | Licensed roster (e.g. Data Axle government channel); Census County/ZIP Business Patterns for counts only | Directory release shown; "not in source" ≠ "does not exist" | Proposed; licence required |
| Job postings and posting history | Governed feed (NLx Research Hub) or licensed API (Lightcast); no scraping; LinkedIn and Indeed have no lawful read path | Coverage window and source shown; no instant-notification or complete-history promise | Proposed; licence required |
| Employer-confirmed feedback | Workspace threads and meeting records | Employer-confirmed outranks AI-extracted | Proposed (P2) |

## 4. Occupation and regional references (S3) — proposed, P2

| Family | Source | Terms | Status |
| --- | --- | --- | --- |
| Occupation profiles, Job Zones, SOC crosswalk | O*NET Web Services | CC BY 4.0 with attribution | Proposed |
| Occupation wages, skills gaps, licences, training providers | CareerOneStop Web APIs | Royalty-free; registration; per-page attribution; geocodes may not be stored | Proposed |
| Regional in-demand / high-wage indexes | CCC Centers of Excellence, EDD LMID | Published research; consumed as released, never recomputed | Proposed |
| Grant and review frameworks | CCCCO Perkins V CLNA framework, Title 5 §55601, Ed Code §78016 | Public documents; define evidence to capture, not a data feed | Reference only |

## 5. Private student and placement data (S4) — proposed, P3

| Family | Source | Obligation | Status |
| --- | --- | --- | --- |
| Student profile, applications, interview outcomes, placement, alumni follow-up | User-owned, opt-in | Explicit share grants; deletion within 24 hours; excluded from any public graph | Proposed (P3) |
| SIS import | No vendor established | FERPA school-official terms before any connector | Unsupported |

## 6. Calipar program review (S5) — verified pointer, P2 exchange

Calipar owns program reviews, action plans and resource requests. ApplicationX
exchanges evidence packages and proposed actions with it through the P2
exchange contract; no Calipar data is read directly.

## 7. Owner source documents

The three owner artifacts (product benefits deck, benefit summary, Tier-1
inputs/outputs use case) were reviewed as requirements evidence. They are not
data-provider contracts or proof of access, and their raw files are not copied
into this public repository. The
[research report](research/2026-09-20-applicationx-deep-research.md) maps each
promised benefit to a source, a status and, where a source is unavailable, the
reason.

## 8. Coverage acceptance procedure

1. Every family above appears in `connectors/data_families.yaml` with a phase,
   disposition and status.
2. An implemented family links to exactly one registered operation with success,
   empty, partial and error fixtures.
3. `GET /v1/sources` lists every connector with its phase and status;
   `GET /v1/sources/{id}/health` reports configuration and freshness.
4. A family gated on a licence stays `proposed` until the licence exists; lack of
   credentials is never reported as coverage.
