# Implementer — common instructions (P1b-1, ApplicationX)

Repo: `/Users/laccd/code/applicationx`, branch `p1b-1/chat-breadth`. Backend: `cd backend && python -m pytest <files> -q --no-cov` while iterating; the full suite `python -m pytest -q` once before your final report (Postgres :5434 via Docker `applicationx-db-1`; coverage floor 70 %). If `python` is not the repo venv, use the interpreter the README names. Never use ports 5433/3000/8000.

Rules:
- Follow your task brief exactly (TDD order: write the failing tests, run them and confirm the expected failure, implement, run green). The brief's code is the spec; adapt only where the existing code makes it impossible, and say so in the report.
- Do NOT dispatch subagents of any kind — no helpers, never a reviewer. Review is the controller's and is already scheduled.
- Never `git stash`, `git reset`, `git checkout` other branches, or touch other repos (`/Users/laccd/code/calricula` is read-only reference; `/Users/laccd/code/laccd_chatbot` and `/Users/laccd/code/cli-tools/*` must not be touched at all).
- No personal email anywhere; no secrets; connector results never echo source bodies or tokens.
- Commit with the brief's message; the trailer is its own final paragraph: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Self-review your diff before reporting (completeness vs the brief, names, YAGNI, tests verify real behaviour, clean test output).

Report contract: write the full report to the report path given in your dispatch (what you implemented, TDD evidence: RED command + failing output, GREEN command + passing output, full-suite result with coverage, files changed, deviations, self-review, concerns). Then reply with ONLY (under 12 lines): status (DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED), commit hash(es), one-line test summary, concerns.
