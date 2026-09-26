### Task 4: Transfer route — ASSIST resolve → agreements list, agreement cards, validation

**Files:**
- Modify: `backend/app/chat/pipeline.py` (`SUPPORTED`, `_plan`)
- Modify: `backend/app/chat/cards.py`
- Modify: `backend/app/chat/validate.py`
- Test: `backend/tests/test_chat_transfer.py`

**Interfaces:**
- Consumes: `articulation.resolve(name, year)` → `{source, institution_id, academic_year_id, institution{id, code, names[{name}]}, academic_year{id, code, name}}`; `articulation.list(receiving_id, sending_id, year_id, types?)` → `{isSuccessful, result{reports[{key,label,type}]}}` (the registry's `_reports` helper reads it); `scope.institution`, `scope.year` (Task 1); `assist_name()` (Task 2).
- Produces: a stateful follow-up: the two resolves run first (sending campus, then receiving institution); once both ids and the year id are known, `articulation.list` is queued. Evidence: kind `evidence` for each resolve (`assist:institution:<id>`, fields `{institution_id, code, name, year, year_id}`), kind `agreement` per report (`assist:agreement:<key>`, fields `{key, label, type, year, sending, receiving}`).

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_chat_transfer.py`:
```python
import json

from app.chat.model_gateway import Draft, FakeGateway
from app.chat.pipeline import PipelineInput, run_pipeline
from app.chat.slots import ResolvedScope
from app.chat.validate import check
from app.connectors.registry import REGISTRY, execute
from app.connectors.replay import load_outcome
from app.identity.principal import Principal

UCLA = "University of California, Los Angeles"


def _resolve_outcome(name: str):
    """The recorded resolve fixture answers for LAMC; the receiving institution gets a different id."""
    base = load_outcome("assist", "articulation.resolve", "success")
    if name.startswith("Los Angeles"):
        return base
    doc = json.loads(base.stdout)
    doc["results"].update({"institution_id": 117, "institution": {"id": 117, "code": "UCLA", "names": [{"name": name}]}})
    return base.model_copy(update={"stdout": json.dumps(doc)})


def _executor(calls):
    def ex(op_name, request, runner=None):
        calls.append((op_name, dict(request.parameters)))
        if op_name == "articulation.resolve":
            return execute(op_name, request, runner=lambda *a, **k: _resolve_outcome(request.parameters["name"]))
        return execute(op_name, request, runner=lambda *a, **k: load_outcome(REGISTRY[op_name].connector_id, op_name, "success"))
    return ex


def _inp(q, prior=None, explicit=None):
    return PipelineInput(question=q, principal=Principal(kind="public"), prior_scope=prior or ResolvedScope(campus="LAMC"),
                         defaults=ResolvedScope(year="2025"), context_id="ctx", explicit_scope=explicit or ResolvedScope())


def test_transfer_resolves_both_institutions_then_lists_agreements():
    calls = []
    ans = run_pipeline(_inp("Which LAMC courses transfer to UCLA?"), executor=_executor(calls), gateway=FakeGateway(), emit=lambda *a: None)
    assert [c[0] for c in calls] == ["articulation.resolve", "articulation.resolve", "articulation.list"]
    assert calls[0][1] == {"name": "Los Angeles Mission College", "year": "2025"}
    assert calls[1][1] == {"name": UCLA, "year": "2025"}
    assert calls[2][1] == {"receiving_id": "117", "sending_id": "118", "year_id": "75"}
    assert ans.route == "transfer" and ans.resolved_scope["institution"] == UCLA and ans.resolved_scope["year"] == "2025"
    assert [c.kind for c in ans.cards].count("agreement") == 2 and ans.completeness == "complete"


def test_transfer_without_institution_is_a_clarification_and_calls_nothing():
    calls = []
    ans = run_pipeline(_inp("does math 261 transfer?"), executor=_executor(calls), gateway=FakeGateway(), emit=lambda *a: None)
    assert calls == [] and ans.clarification is not None and ans.clarification.slot == "institution"


def test_transfer_agreement_subject_and_year_claims_are_checked():
    calls = []
    good = FakeGateway(lambda g: Draft(answer="For 2025-2026 there are agreements for Mathematics and Biology.", cited_ids=[e["evidence_id"] for e in g.evidence]))
    ans = run_pipeline(_inp("LAMC articulation agreements with UCLA"), executor=_executor(calls), gateway=good, emit=lambda *a: None)
    assert not any(w.code == "unsupported_claim_withheld" for w in ans.warnings)
    bad = FakeGateway(lambda g: Draft(answer="For 2023 there is an agreement for Nursing.", cited_ids=[e["evidence_id"] for e in g.evidence]))
    ans = run_pipeline(_inp("LAMC articulation agreements with UCLA"), executor=_executor([]), gateway=bad, emit=lambda *a: None)
    w = [w for w in ans.warnings if w.code == "unsupported_claim_withheld"]
    assert w and "Nursing" in w[0].message and "2023" in w[0].message


def test_resolve_failure_stops_before_listing():
    def ex(op_name, request, runner=None):
        return execute(op_name, request, runner=lambda *a, **k: load_outcome("assist", "articulation.resolve", "outage"))
    ans = run_pipeline(_inp("LAMC articulation agreements with UCLA"), executor=ex, gateway=FakeGateway(), emit=lambda *a: None)
    assert ans.completeness in ("partial", "unknown") and not any(c.kind == "agreement" for c in ans.cards)


def test_transfer_validate_rules_directly():
    ev = {"assist:agreement:k1": {"fields": {"key": "k1", "label": "Mathematics", "type": "Department", "year": "2025"}}}
    kept, reasons = check(Draft(answer="Agreement for Mathematics in 2025.", cited_ids=["assist:agreement:k1"]), ev, "transfer")
    assert reasons == []
    kept, reasons = check(Draft(answer="Agreement for Physics in 2019.", cited_ids=["assist:agreement:k1"]), ev, "transfer")
    assert any("Physics" in r for r in reasons) and any("2019" in r for r in reasons)
```
Add `fixtures/synthetic/assist/articulation.resolve/outage.json` if missing (same shape as other outage fixtures).

- [ ] **Step 2: Run** → FAIL (`unsupported_in_release`)

- [ ] **Step 3: Implement**

`cards.py` branches:
```python
    elif op == "articulation.resolve":
        d = r.data
        inst = d.get("institution") or {}
        name = (inst.get("names") or [{}])[0].get("name")
        yr = d.get("academic_year") or {}
        out.append({"evidence_id": f"assist:institution:{d.get('institution_id')}", "kind": "evidence",
                    "summary": f"ASSIST institution {name} ({inst.get('code')}) id {d.get('institution_id')}, academic year {yr.get('name')}",
                    "fields": {"institution_id": d.get("institution_id"), "code": inst.get("code"), "name": name,
                               "year": str(yr.get("code") or ""), "year_id": d.get("academic_year_id")},
                    "observed_at": obs, "card": {"type": "institution", **d}})
    elif op == "articulation.list":
        result = (r.data.get("result") or {}) if isinstance(r.data, dict) else {}
        scope = r.coverage.scope if r.coverage else {}
        for rep in result.get("reports") or []:
            if not isinstance(rep, dict) or "key" not in rep:
                continue
            year = str(rep["key"]).split("/")[0]
            out.append({"evidence_id": f"assist:agreement:{rep['key']}", "kind": "agreement",
                        "summary": f"Articulation agreement ({rep.get('type')}) for {rep.get('label')}, key {rep['key']}",
                        "fields": {"key": rep["key"], "label": rep.get("label"), "type": rep.get("type"), "year": scope.get("year") or None,
                                   "year_id": year},
                        "observed_at": obs, "card": {"type": "agreement", **rep}})
```
(`scope.get("year")` is None unless the plan passes it; the pipeline sets `fields["year"]` by post-processing: in the transfer plan's follow-up we know the year — simpler: the pipeline's `run_pipeline` sets `e["fields"].setdefault("year", scope.year)` for `agreement` entries when `scope.year` is set. Implement that one line in the evidence loop: `if e["kind"] == "agreement" and scope.year: e["fields"]["year"] = scope.year`.)

`validate.py`:
```python
_AGREEMENT_SUBJECT = re.compile(r"\bagreements?\s+(?:for|in|de|para)\s+([A-Za-zÀ-ÿ&][A-Za-zÀ-ÿ& ]{1,40}?)(?=[,.;]|\s+(?:and|y|or|o)\b|$)", re.I)
```
```python
    elif route == "transfer":
        labels_ok = {str(f.get("label")).lower() for f in fields if f.get("label")}
        for subj in _AGREEMENT_SUBJECT.findall(draft.answer):
            if subj.strip().lower() not in labels_ok:
                reasons.append(f"agreement subject {subj.strip()} not in evidence")
        years_ok = {str(f.get("year")) for f in fields if f.get("year")}
        for y in re.findall(r"\b(20\d{2})\b", draft.answer):
            if y not in years_ok:
                reasons.append(f"year {y} not in evidence")
```
(Where the fields carry `year="2025"`, an answer saying "2025-2026" yields years `2025` and `2026`; add the following year too: `years_ok |= {str(int(y) + 1) for y in list(years_ok) if y.isdigit()}`.)

`pipeline.py` — `SUPPORTED |= {"transfer"}` and the plan branch:
```python
    if intent == "transfer":
        sending = assist_name(scope.campus or "")
        if not sending or not scope.institution or not scope.year:
            return [], lambda op, data: [], [unconfigured("assist", scope.campus or "?", "articulation lookups")]
        state: dict[str, str] = {}

        def follow_up(op: str, data: object) -> Plan:
            if op != "articulation.resolve" or not isinstance(data, dict) or "institution_id" not in data:
                return []
            code = ((data.get("institution") or {}).get("code") or "").upper()
            key = "sending" if code == (scope.campus or "").upper() else "receiving"
            state[key] = str(data["institution_id"])
            state.setdefault("year_id", str(data.get("academic_year_id")))
            if {"sending", "receiving", "year_id"} <= state.keys() and not state.get("listed"):
                state["listed"] = "1"
                return [("articulation.list", {"receiving_id": state["receiving"], "sending_id": state["sending"], "year_id": state["year_id"]})]
            return []
        return [("articulation.resolve", {"name": sending, "year": scope.year}),
                ("articulation.resolve", {"name": scope.institution, "year": scope.year})], follow_up, []
```
Import `assist_name` from `app.chat.campuses`.

- [ ] **Step 4: Run** `cd backend && python -m pytest tests/test_chat_transfer.py tests/test_chat_pathway.py tests/test_chat_pipeline.py tests/test_slots_p1b.py -q --no-cov` → pass

- [ ] **Step 5: Commit** — `feat(chat): transfer route resolves both institutions through ASSIST and lists agreements with typed cards`

---

