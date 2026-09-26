### Task 3: Pathway route — plan, cards, validation

**Files:**
- Modify: `backend/app/chat/pipeline.py` (`SUPPORTED`, `_plan`, citation `source_period`)
- Modify: `backend/app/chat/cards.py` (`evidence_from` branches)
- Modify: `backend/app/chat/validate.py` (`pathway` rules)
- Test: `backend/tests/test_chat_pathway.py`

**Interfaces:**
- Consumes: `pathways.search(site_content_id, query)` → list rows `{programId, title, awardTitle, siteContentId, collegeId, linkedPathway, catalogUrl, careerStandardOccupationalCodes[], pathways[{programMapId,label,defaultPathway}]}`; `pathways.get(site_content_id, program_id)` → one row of the same shape; `pathways.plan(program_id)` → `{program_id, title, award, program_map_id, terms_to_completion, terms[{term_number,label,year,items[],term_min_units,term_max_units}], total_min_units, total_max_units, source}`; `pathways.transfer_options(program_id)` → `{program_id,title,award,transfer_designated,linked_pathway,transfer_pathways[{label,program_map_id,default_pathway,transfer_continuation}],career_outlook{avg_salary_k,low_salary_k,high_salary_k,job_growth_pct,careers[]}}` (shapes from `fixtures/synthetic/programmapper/*/success.json`). `site_content_id()`/`unconfigured()` from Task 2.
- Produces: `_plan("pathway", ...)` = `[("pathways.search", {site_content_id, query})]` with a follow-up that, on the top hit, adds `pathways.get` and `pathways.plan`; evidence entries of kind `pathway` with `fields` `{program_id, title, award, soc_codes, total_min_units, total_max_units, terms_to_completion, transfer_designated}`; `_plan` returns a third element `warnings: list[AnswerWarning]` (pre-flight warnings such as unconfigured) — **the signature becomes `_plan(intent, q, scope, language) -> tuple[Plan, FollowUp, list[AnswerWarning]]`** and `run_pipeline` merges those warnings and marks `partial`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_chat_pathway.py`:
```python
from app.chat.model_gateway import Draft, FakeGateway
from app.chat.pipeline import PipelineInput, run_pipeline
from app.chat.slots import ResolvedScope
from app.chat.validate import check
from app.connectors.registry import REGISTRY, execute
from app.connectors.replay import load_outcome
from app.identity.principal import Principal


def _replay_executor(state_by_op=None):
    state_by_op = state_by_op or {}
    def ex(op_name, request, runner=None):
        return execute(op_name, request, runner=lambda *a, **k: load_outcome(REGISTRY[op_name].connector_id, op_name, state_by_op.get(op_name, "success")))
    return ex


def _inp(q, campus="LAMC", **kw):
    return PipelineInput(question=q, language=kw.get("language", "en"), principal=Principal(kind="public"),
                         prior_scope=ResolvedScope(campus=campus, term="2268"), defaults=ResolvedScope(), context_id="ctx")


def test_pathway_plan_searches_then_follows_top_hit():
    ops = []
    ex = _replay_executor()
    def spy(op_name, request, runner=None):
        ops.append((op_name, dict(request.parameters)))
        return ex(op_name, request)
    ans = run_pipeline(_inp("Show me the biology program map"), executor=spy, gateway=FakeGateway(), emit=lambda *a: None)
    names = [o for o, _ in ops]
    assert names == ["pathways.search", "pathways.get", "pathways.plan"]
    assert ops[0][1]["site_content_id"] == "0055f609-1a83-4937-8356-c67ec89cb496" and "biology" in ops[0][1]["query"].lower()
    assert ops[1][1]["program_id"] == "p1" and ops[2][1]["program_id"] == "p1"
    assert ans.route == "pathway" and any(c.kind == "pathway" for c in ans.cards) and ans.completeness == "complete"
    assert any(e.evidence_id == "programmapper:plan:p1" for e in ans.citations)


def test_pathway_units_and_terms_claims_are_checked():
    ex = _replay_executor()
    ok = FakeGateway(lambda g: Draft(answer="The Biology AS takes 4 terms and 60–62 units.", cited_ids=[e["evidence_id"] for e in g.evidence]))
    ans = run_pipeline(_inp("biology pathway"), executor=ex, gateway=ok, emit=lambda *a: None)
    assert not any(w.code == "unsupported_claim_withheld" for w in ans.warnings)
    bad = FakeGateway(lambda g: Draft(answer="The Biology AS takes 2 terms and 45 units.", cited_ids=[e["evidence_id"] for e in g.evidence]))
    ans = run_pipeline(_inp("biology pathway"), executor=ex, gateway=bad, emit=lambda *a: None)
    w = [w for w in ans.warnings if w.code == "unsupported_claim_withheld"]
    assert w and "45" in w[0].message and "2 terms" in w[0].message and ans.completeness == "partial"


def test_unconfigured_campus_is_an_explicit_warning_without_tool_calls(monkeypatch):
    import app.chat.campuses as campuses
    monkeypatch.setattr(campuses, "site_content_id", lambda c: None)
    called = []
    ans = run_pipeline(_inp("biology pathway", campus="LASC"), executor=lambda *a, **k: called.append(a), gateway=FakeGateway(), emit=lambda *a: None)
    assert called == [] and ans.route == "pathway" and ans.completeness == "unknown"
    assert any(w.code == "unconfigured" and w.source_id == "programmapper" and "LASC" in w.message for w in ans.warnings)


def test_pathway_search_outage_is_partial_not_empty_success():
    ans = run_pipeline(_inp("biology program map"), executor=_replay_executor({"pathways.search": "outage"}), gateway=FakeGateway(), emit=lambda *a: None)
    assert ans.completeness in ("partial", "unknown") and any(w.source_id == "programmapper" for w in ans.warnings)


def test_pathway_validate_rules_directly():
    ev = {"programmapper:plan:p1": {"fields": {"total_min_units": 60.0, "total_max_units": 62.0, "terms_to_completion": 4}}}
    kept, reasons = check(Draft(answer="4 terms, 60 units, maybe 61 units", cited_ids=["programmapper:plan:p1"]), ev, "pathway")
    assert kept == ["programmapper:plan:p1"] and reasons == []
    kept, reasons = check(Draft(answer="3 terms and 70 units", cited_ids=["programmapper:plan:p1"]), ev, "pathway")
    assert any("70" in r for r in reasons) and any("3 terms" in r for r in reasons)
```

The fixture `pathways.search/outage.json` must exist; check `ls fixtures/synthetic/programmapper/pathways.search/` — if only `success.json` exists, add `outage.json` copied from `fixtures/synthetic/laccd_class_search/schedule.section/outage.json` (same envelope: non-zero exit, empty stdout).

- [ ] **Step 2: Run** `cd backend && python -m pytest tests/test_chat_pathway.py -q --no-cov` → FAIL (route `unsupported_in_release`)

- [ ] **Step 3: Implement**

`backend/app/chat/cards.py` — add after `_course_entry`:
```python
def _pathway_entry(row: dict, obs: str | None) -> dict:
    pid = row.get("programId") or row.get("program_id")
    site = row.get("siteContentId") or ""
    return {"evidence_id": f"programmapper:program:{site}:{pid}", "kind": "pathway",
            "summary": f"{row.get('title')} ({row.get('awardTitle') or row.get('award')}), program map"
                       f"{' linked' if row.get('linkedPathway') else ''}; SOC {', '.join(row.get('careerStandardOccupationalCodes') or []) or 'none listed'}",
            "fields": {"program_id": pid, "title": row.get("title"), "award": row.get("awardTitle") or row.get("award"),
                       "soc_codes": list(row.get("careerStandardOccupationalCodes") or [])},
            "observed_at": obs, "url": row.get("catalogUrl"), "card": row}
```
and new branches in `evidence_from` before the final `return out`:
```python
    elif op in ("pathways.search", "pathways.get"):
        rows = r.data if isinstance(r.data, list) else [r.data]
        out.extend(_pathway_entry(row, obs) for row in rows if isinstance(row, dict) and (row.get("programId") or row.get("program_id")))
    elif op == "pathways.plan":
        d = r.data
        out.append({"evidence_id": f"programmapper:plan:{d.get('program_id')}", "kind": "pathway",
                    "summary": f"{d.get('title')} {d.get('award')} map: {d.get('terms_to_completion')} terms, "
                               f"{_num(d.get('total_min_units'))}–{_num(d.get('total_max_units'))} units",
                    "fields": {"program_id": d.get("program_id"), "total_min_units": d.get("total_min_units"),
                               "total_max_units": d.get("total_max_units"), "terms_to_completion": d.get("terms_to_completion")},
                    "observed_at": obs, "card": {"type": "plan", **d}})
    elif op == "pathways.transfer_options":
        d = r.data
        paths = [p.get("label") for p in d.get("transfer_pathways") or [] if isinstance(p, dict)]
        out.append({"evidence_id": f"programmapper:transfer:{d.get('program_id')}", "kind": "pathway",
                    "summary": f"{d.get('title')} {d.get('award')}: transfer designated {d.get('transfer_designated')}; "
                               f"pathways {', '.join(p for p in paths if p) or 'none'}",
                    "fields": {"program_id": d.get("program_id"), "transfer_designated": d.get("transfer_designated"), "transfer_pathways": paths},
                    "observed_at": obs, "card": {"type": "transfer_options", **d}})
```

`backend/app/chat/validate.py` — add the regex and the rule:
```python
_TERMS = re.compile(r"\b(\d{1,2})\s*(?:terms?|semesters?|semestres?|términos?)\b", re.I)
```
and in `check`, after the `catalog` branch:
```python
    elif route == "pathway":
        units_ok = _nums(f.get(k) for f in fields for k in ("total_min_units", "total_max_units", "units"))
        lo = min((float(f["total_min_units"]) for f in fields if f.get("total_min_units") is not None), default=None)
        hi = max((float(f["total_max_units"]) for f in fields if f.get("total_max_units") is not None), default=None)
        for n in _UNITS.findall(draft.answer):
            v = float(n)
            inside = lo is not None and hi is not None and lo <= v <= hi
            if v not in units_ok and not inside:
                reasons.append(f"units value {n} not in evidence")
        terms_ok = _nums(f.get("terms_to_completion") for f in fields)
        reasons += [f"{n} terms not in evidence" for n in _TERMS.findall(draft.answer) if float(n) not in terms_ok]
```

`backend/app/chat/pipeline.py`:
- `SUPPORTED = {"schedule", "catalog", "campus", "pathway"}` (Tasks 4–5 add `transfer`, `workforce`).
- Add `from app.chat.campuses import site_content_id, unconfigured` and `FollowUp = Callable[[str, object], Plan]`.
- Change `_plan` to return three values; every existing branch returns `..., []` as the third element; add the pathway branch:
```python
    if intent == "pathway":
        site = site_content_id(scope.campus or "")
        if not site:
            return [], lambda op, data: [], [unconfigured("programmapper", scope.campus or "?", "program maps")]
        query = re.sub(r"[^\w .&-]", " ", q)[:80].strip()

        def follow_up(op: str, data: object) -> Plan:
            if op != "pathways.search" or not isinstance(data, list) or not data or not isinstance(data[0], dict):
                return []
            pid = str(data[0].get("programId"))
            return [("pathways.get", {"site_content_id": site, "program_id": pid}), ("pathways.plan", {"program_id": pid})]
        return [("pathways.search", {"site_content_id": site, "query": query})], follow_up, []
```
- In `run_pipeline`: `steps, follow_up, pre = _plan(...)`; `warnings.extend(pre)`; `if pre: partial = True`. When `not steps and pre` (nothing to run), skip the executor loop and the model: return `ChatAnswer(answer=..., route=intent, resolved_scope=resolved, warnings=warnings, completeness="unknown")` with `answer="This source is not configured for the selected campus."` — put this check right after the `SUPPORTED` guard.
- Citation construction: `Citation(..., source_period=evidence[i].get("source_period"), observed_at=...)`.

- [ ] **Step 4: Run** `cd backend && python -m pytest tests/test_chat_pathway.py tests/test_chat_pipeline.py -q --no-cov` → pass

- [ ] **Step 5: Commit** — `feat(chat): pathway route through pathways.search/get/plan with typed cards and unit/term claim checks`

---

