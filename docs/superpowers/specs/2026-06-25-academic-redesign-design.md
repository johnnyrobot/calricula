# Calricula — Institutional ("Traditional Academic") Redesign

**Date:** 2026-06-25
**Status:** Approved direction; Paper mockups to be produced
**Scope:** Visual redesign mocked in Paper (Paper MCP). No code changes in this effort.

## Goal

Replace the current "Luminous" modern-SaaS look (indigo/purple gradients, rounded-xl
cards, soft shadows, Inter everywhere) with a **traditional academic** visual language
appropriate to a Course-Outline-of-Record system governed by Title 5 / PCAH / CB codes.
The app should read as a **catalog of record**, not a startup dashboard.

This effort produces approved mockups in Paper only. Implementation into the
Next.js/Tailwind codebase is a separate, later effort.

## Design language

**Register:** Traditional academic / collegiate. Document-like, ruled, restrained.

**What kills the SaaS feel (non-negotiable):**
- Squared corners (radius 0–2px). No `rounded-xl`.
- No drop shadows. Hairline rules and 1px borders do all visual separation.
- Ruled data tables (no colored zebra stripes); uppercase letterspaced column heads.
- Status shown as restrained "seals," not bright pill badges.
- Cards become *framed record panels*: hairline border + a thin gold top rule.
- Serif masthead with a thin gold rule beneath.

### Tokens

Palette:

| Role | Value |
|---|---|
| Page (parchment) | `#F7F3E9` |
| Panel / paper white | `#FCFAF4` |
| Ink (primary text) | `#1C1B19` |
| Ink secondary (warm gray) | `#4A463E` |
| Navy ink (crest / primary) | `#1F2A44` |
| Navy hover | `#16203A` |
| Gold (hairlines, seal, rules) | `#9A7B2E` |
| Hairline border | `#D8D0BE` |
| Status — approved | `#2F5D45` (muted green) |
| Status — in review | `#8A6D1F` (ochre) |
| Status — draft | `#5B5750` (slate) |
| Status — returned/rejected | `#7A2E2E` (oxblood) |

Theme: **light-only** (parchment). Dark mode is dropped — a "dark parchment" is
inauthentic to the register.

Typography:
- **Serif** for page titles, section headings, and document content.
- **Quiet sans** for UI chrome, form labels, nav, and tabular data.
- **Tabular numerals** for units, hours, and codes.
- Exact families to be confirmed against Paper's available fonts before styling
  (target: a transitional/old-style serif such as Source Serif 4 / Spectral; a
  sober humanist sans such as IBM Plex Sans). Confirm via `get_font_family_info`.

Type scale (px): page title ~32 · section ~23 · subsection ~18 · body 16 ·
label 13 (uppercase, letterspaced, small-caps register).

Accessibility: maintain WCAG 2.2 AA contrast for all text/UI pairings (the app is a
regulated public tool). Navy `#1F2A44` and ink on parchment clear AA comfortably;
verify status colors and secondary ink against their backgrounds.

## Component inventory (style tile + patterns sheet)

Masthead / app bar · sidebar index-nav · framed record panel · ruled data table +
status seals · buttons (primary navy fill / secondary navy outline / tertiary text /
danger oxblood) · form controls (text, select, textarea, checkbox, radio) ·
breadcrumb ("filed under" path) · section dividers & tabs · notice banner ·
document title block · modal/dialog · toast/notice · empty state.

## Screen inventory (28 Paper boards)

Foundation
1. Style tile / tokens (palette, type scale, status seals)
2. Component & patterns sheet

Entry
3. Login
4. Forgot / reset password

Overview
5. Dashboard — registrar's desk (status counts, approvals queue, recent activity)
6. Notifications center

Courses (CORs)
7. Courses list — ruled data table + filters
8. Course Outline of Record — document/read view (centerpiece)
9. Course Outline of Record — edit mode
10. SLO editor — Bloom's verb picker + cognitive-level distribution
11. CB Code Wizard — natural-language → 27 codes
12. Requisites editor — prereq/coreq builder
13. Cross-listing view
14. 54-hour rule / units validation panel
15. Version history + diff/compare

Programs
16. Programs list
17. Program builder/detail — degree & certificate, 60-unit limit

Approvals & workflow
18. Approvals queue
19. Review detail — COR under review
20. Workflow routing/status (Faculty → Dept → Committee → Articulation → Approved)
21. Comments / annotations thread

Data & library
22. Library — document repository
23. LMI data — occupational wages & projections
24. BLS data view

AI
25. AI-assist panel/drawer

Admin & system
26. Admin — users & roles
27. Accessibility statement page
28. System states — 404 / error / empty states

## Approach in Paper

1. Confirm fonts (`get_font_family_info`) and create design tokens in Paper.
2. Build foundation boards (style tile, components) first so screens reuse them.
3. Design screens grouped as above; screenshot and self-review after each group.
4. Keep content faithful to the real app (real fields: units, CB codes, SLOs,
   requisites, workflow stages) so mockups are usable as build references.

## Out of scope

- Any change to the Next.js/Tailwind codebase, `tailwind.config.ts`, or
  `globals.css` (separate later effort).
- Backend, data model, or copy changes.
- Adding/removing app features — this is purely a visual reskin of existing flows.
