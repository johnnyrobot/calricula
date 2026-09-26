### Task 7: Evaluation answerer over the real pipeline and the CI gate

**Files:**
- Create: `evals/pipeline_answerer.py`, `evals/run_fake.py`, `evals/scorecards/.gitkeep`
- Test: `backend/tests/test_evals_pipeline.py`
- Modify: `.github/workflows/ci.yml` (backend job runs `python -m evals.run_fake --lang en --check`), `evals/README.md` (how to run; the ES set stays `pending` until the owner's bilingual review — P1b-3)

**Interfaces:**
- Consumes: `evals.harness.Answerer/AnswerRecord/run`, `evals.schema.EvalCase`, `run_pipeline`, `FakeGateway`, `execute` + `load_outcome` replay, `lmi` fixture via `CONNECTOR_REPLAY`.
- Produces: `PipelineAnswerer(session: Session | None = None, term: str = "2268", year: str = "2025")` with `.answer(case) -> AnswerRecord`, `.evidence_ids: set[str]` (every evidence id any answer produced), `.routes: dict[str, int]`, `.clarifications: int`; `evals.run_fake.main(argv) -> int` writing `evals/scorecards/fake-<lang>.json` (`{scorecard, routes, clarifications, unsupported_share, generated_at}`) and, with `--check`, exiting 1 when `citation_support_rate < 1.0` or when the share of cases in the supported families (`campus, catalog, schedule, pathway, transfer, workforce`) whose route is `unsupported_in_release` exceeds 0.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_evals_pipeline.py`:
```python
import json
import pytest

from evals import harness
from evals.pipeline_answerer import PipelineAnswerer
from evals.run_fake import load_cases, main
from evals.schema import EvalCase


def _case(q, fam, lang="en", campus="LAMC"):
    return EvalCase(id=f"t-{fam}", lang=lang, campus=campus, template_id="t", question=q, intent_family=fam, review_status="reviewed")


def test_answerer_runs_supported_families_with_citations(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "CONNECTOR_REPLAY", True)
    monkeypatch.setattr(settings, "CALRICULA_API_ORIGIN", "https://calricula.test")
    a = PipelineAnswerer()
    cases = [_case("Are there open seats in MULTIMD 100 class 17300?", "schedule"), _case("biology program map", "pathway"),
             _case("Which LAMC courses transfer to UCLA?", "transfer"), _case("registered nurse salary", "workforce")]
    sc = harness.run(a, cases, evidence_lookup=lambda e: e in a.evidence_ids)
    assert sc.total == 4 and sc.citation_support_rate == 1.0 and sc.critical_claim_support_rate == 1.0
    assert set(a.routes) >= {"schedule", "pathway", "transfer", "workforce"} and "unsupported_in_release" not in a.routes


def test_answerer_reports_clarifications_and_unsupported_routes():
    a = PipelineAnswerer()
    rec = a.answer(_case("does math 261 transfer?", "transfer"))
    assert rec.route == "transfer" and rec.citations == [] and a.clarifications == 1
    rec = a.answer(_case("which textbook for math 261?", "resource"))
    assert rec.route == "unsupported_in_release"


def test_run_fake_writes_scorecard_and_check_passes_for_en(tmp_path, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "CONNECTOR_REPLAY", True)
    monkeypatch.setattr(settings, "CALRICULA_API_ORIGIN", "https://calricula.test")
    out = tmp_path / "fake-en.json"
    assert main(["--lang", "en", "--out", str(out), "--check", "--limit", "60"]) == 0
    doc = json.loads(out.read_text())
    assert doc["scorecard"]["citation_support_rate"] == 1.0 and doc["routes"] and "generated_at" in doc


def test_load_cases_reads_only_reviewed_cases():
    en = load_cases("en")
    assert en and all(c.review_status == "reviewed" for c in en)
    assert load_cases("es") == []  # pending until the owner's review (P1b-3)
```

- [ ] **Step 2: Run** `cd backend && python -m pytest tests/test_evals_pipeline.py -q --no-cov` → FAIL (`ModuleNotFoundError: evals.pipeline_answerer`). (Check how `tests/test_evals.py` imports `evals` — the repo root must be on `sys.path`; follow the same mechanism.)

- [ ] **Step 3: Implement**

`evals/pipeline_answerer.py`:
```python
"""Answerer that scores the real chat pipeline with the fake model and replay fixtures.

No binary, model key or network is needed: connector calls replay the recorded
`fixtures/synthetic/<connector>/<op>/success.json` outcomes, in-process
connectors honour `CONNECTOR_REPLAY`, and the FakeGateway drafts by joining
evidence summaries and citing every entry. What the harness then measures is
routing coverage and citation discipline, not model quality.
"""
from datetime import datetime, timezone

from sqlmodel import Session

from app.chat.model_gateway import FakeGateway
from app.chat.pipeline import ChatAnswer, PipelineInput, run_pipeline
from app.chat.slots import ResolvedScope
from app.connectors.registry import REGISTRY, execute
from app.connectors.replay import load_outcome
from app.identity.principal import Principal
from evals.harness import AnswerRecord
from evals.schema import EvalCase


class PipelineAnswerer:
    def __init__(self, session: Session | None = None, term: str = "2268", year: str = "2025") -> None:
        self.session, self.term, self.year = session, term, year
        self.evidence_ids: set[str] = set()
        self.routes: dict[str, int] = {}
        self.clarifications = 0

    def _executor(self, op_name, request, runner=None):
        connector = REGISTRY[op_name].connector_id
        return execute(op_name, request, runner=lambda *a, **k: load_outcome(connector, op_name, "success"), session=self.session)

    def answer(self, case: EvalCase) -> AnswerRecord:
        inp = PipelineInput(question=case.question, language=case.lang, principal=Principal(kind="public"),
                            prior_scope=ResolvedScope(campus=case.campus, term=self.term), defaults=ResolvedScope(year=self.year),
                            context_id=f"eval:{case.id}")
        ans: ChatAnswer = run_pipeline(inp, executor=self._executor, gateway=FakeGateway(), emit=lambda t, p: None)
        self.routes[ans.route] = self.routes.get(ans.route, 0) + 1
        if ans.clarification is not None:
            self.clarifications += 1
        self.evidence_ids |= {c.evidence_id for c in ans.citations}
        claims = [{"type": t, "evidence_id": c.evidence_id} for c in ans.citations for t in case.critical_claim_types]
        return AnswerRecord(answer_text=ans.answer, route=ans.route, citations=[c.evidence_id for c in ans.citations],
                            unknowns=[w.message for w in ans.warnings], critical_claims=claims)


def stamp() -> str:
    return datetime.now(timezone.utc).isoformat()
```
(`load_outcome` for an in-process connector like `calricula_lmi`/`campus_corpus` is never called because `execute` dispatches `IN_PROCESS` first; `campus.search` without a session returns a typed `unavailable`, which the scorecard reflects as a warning, not a crash.)

`evals/run_fake.py`:
```python
"""Score the reviewed question set against the real pipeline with the fake model and replay fixtures.

Usage: python -m evals.run_fake --lang en [--out evals/scorecards/fake-en.json] [--check] [--limit N]
`--check` exits 1 when any citation fails to resolve or any case in a supported
family routes to unsupported_in_release — the CI gate for routing regressions.
"""
import argparse, json, pathlib, sys

from evals import harness
from evals.pipeline_answerer import PipelineAnswerer, stamp
from evals.schema import EvalCase

ROOT = pathlib.Path(__file__).resolve().parent
SUPPORTED_FAMILIES = {"campus", "catalog", "schedule", "pathway", "transfer", "workforce"}


def load_cases(lang: str) -> list[EvalCase]:
    path = ROOT / "questions" / lang / "laccd_public.jsonl"
    cases = [EvalCase(**json.loads(line)) for line in path.read_text().splitlines() if line.strip()]
    return [c for c in cases if c.review_status == "reviewed"]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", choices=["en", "es"], default="en")
    ap.add_argument("--out", default=None)
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args(argv)
    cases = load_cases(args.lang)[: args.limit]
    answerer = PipelineAnswerer()
    unsupported = 0
    def lookup(e: str) -> bool:
        return e in answerer.evidence_ids
    # Count unsupported routes per case family while scoring.
    class Counting:
        def answer(self, case):
            nonlocal unsupported
            rec = answerer.answer(case)
            if case.intent_family in SUPPORTED_FAMILIES and rec.route == "unsupported_in_release":
                unsupported += 1
            return rec
    sc = harness.run(Counting(), cases, evidence_lookup=lookup)
    doc = {"scorecard": sc.model_dump(), "routes": answerer.routes, "clarifications": answerer.clarifications,
           "unsupported_share": (unsupported / len(cases)) if cases else 0.0, "lang": args.lang, "generated_at": stamp()}
    out = pathlib.Path(args.out or ROOT / "scorecards" / f"fake-{args.lang}.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, indent=2) + "\n")
    print(json.dumps({k: doc[k] for k in ("routes", "clarifications", "unsupported_share")}))
    if args.check and (not cases or sc.citation_support_rate < 1.0 or unsupported > 0):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

`.github/workflows/ci.yml` backend job, after pytest: `- run: CONNECTOR_REPLAY=true CALRICULA_API_ORIGIN=https://calricula.invalid PYTHONPATH=backend python -m evals.run_fake --lang en --check` (from the repo root: `evals` is a top-level package and it imports `app.*` from `backend/`; the same `PYTHONPATH=backend` works locally). Commit the generated `evals/scorecards/fake-en.json` once (run locally) so the repo carries the baseline the roadmap asks for; later runs overwrite it.

- [ ] **Step 4: Run** `cd backend && python -m pytest tests/test_evals_pipeline.py tests/test_evals.py -q --no-cov` and, from the repo root, `CONNECTOR_REPLAY=true CALRICULA_API_ORIGIN=https://calricula.invalid PYTHONPATH=backend python -m evals.run_fake --lang en --check` → exit 0

- [ ] **Step 5: Commit** — `feat(evals): score the real pipeline with the fake model and replay fixtures; CI gate on routing coverage and citation support`

---

