### Task 5: `lmi.lookup` in-process connector and the workforce route

**Files:**
- Create: `backend/app/connectors/lmi.py`, `backend/app/connectors/operations/lmi.py`, `fixtures/synthetic/calricula_lmi/lmi.lookup/success.json`
- Modify: `backend/app/connectors/registry.py` (`IN_PROCESS`, import), `backend/app/core/config.py` (`CALRICULA_API_ORIGIN: str | None = None`), `backend/app/chat/pipeline.py`, `cards.py`, `validate.py`, `connectors/data_families.yaml` (`S9.lmi` → `implemented_tested`)
- Test: `backend/tests/test_lmi_connector.py`, `backend/tests/test_chat_workforce.py`

**Interfaces:**
- Consumes: Calricula `GET {CALRICULA_API_ORIGIN}/api/lmi/search?q=<keyword>` (public, no auth) → `{"wages": [WageData...], "projections": [ProjectionData...]}` where `WageData = {year, area, area_type?, occupation_title, soc_code?, employment?, hourly_mean?, hourly_median?, hourly_10th?, hourly_25th?, hourly_75th?, hourly_90th?, annual_mean?, annual_median?}` and `ProjectionData = {area, area_type?, occupation_title, soc_code?, period?, base_year?, proj_year?, emp_base?, emp_proj?, numeric_change?, percent_change?}`.
- Produces: operation `lmi.lookup` (connector_id `calricula_lmi`, `required={"query": r"[\w .,&/-]{2,80}"}`, optional `{"soc_code": r"\d{2}-\d{4}"}`, `data_source="live"`); `app.connectors.lmi.execute_operation(request, session) -> ConnectorResult` with `data = {"query", "wages", "projections"}`, `status="unconfigured"` (`code="origin_missing"`) when `CALRICULA_API_ORIGIN` is unset, `unavailable` (`upstream_error`/`upstream_timeout`) on HTTP/timeout errors, `ok` with `coverage.retrieved = len(wages)+len(projections)`, `provenance.source_mode="live"`, `provenance.source_url = "<origin>/api/lmi/search"`, `provenance.effective_period` = the newest wage `year`; a module-level `_client_factory() -> httpx.Client` that tests monkeypatch, and replay support: when `settings.CONNECTOR_REPLAY` the fixture JSON is returned instead of an HTTP call. Evidence entries of kind `evidence` with `card.type` `lmi_wage`/`lmi_projection` and `fields` `{soc_code, occupation_title, geography, source_period, denominator, limits, annual_median, annual_mean, hourly_median, employment}` / `{..., percent_change, numeric_change, emp_base, emp_proj, period}` and top-level `source_period`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_lmi_connector.py`:
```python
import json
import httpx
import pytest

from app.connectors import lmi
from app.connectors.contracts import ConnectorRequest, Scope
from app.connectors.registry import REGISTRY, execute
from app.core.config import settings

SAMPLE = {"wages": [{"year": "2024", "area": "Los Angeles-Long Beach-Anaheim, CA", "area_type": "msa", "occupation_title": "Registered Nurses",
                     "soc_code": "29-1141", "employment": 81230, "hourly_median": 62.1, "annual_median": 129170.0, "annual_mean": 133400.0}],
          "projections": [{"area": "California", "occupation_title": "Registered Nurses", "soc_code": "29-1141", "period": "2022-2032",
                           "emp_base": 330000, "emp_proj": 360000, "numeric_change": 30000, "percent_change": 9.1}]}


def _req(**params):
    return ConnectorRequest(operation="lmi.lookup", principal_context={"kind": "public"}, source_id="calricula_lmi",
                            scope=Scope(campus="LAMC"), parameters={"query": "registered nurse", **params})


def _transport(handler):
    return lambda: httpx.Client(transport=httpx.MockTransport(handler), base_url="https://calricula.test")


def test_registered_and_in_process():
    assert "lmi.lookup" in REGISTRY and REGISTRY["lmi.lookup"].connector_id == "calricula_lmi"
    from app.connectors.registry import IN_PROCESS
    assert "calricula_lmi" in IN_PROCESS


def test_unconfigured_without_origin(monkeypatch):
    monkeypatch.setattr(settings, "CALRICULA_API_ORIGIN", None)
    r = execute("lmi.lookup", _req())
    assert r.status == "unconfigured" and r.errors[0].code == "origin_missing"


def test_ok_result_has_typed_provenance_and_coverage(monkeypatch):
    monkeypatch.setattr(settings, "CALRICULA_API_ORIGIN", "https://calricula.test")
    seen = {}
    def handler(req):
        seen["url"] = str(req.url); seen["headers"] = dict(req.headers)
        return httpx.Response(200, json=SAMPLE)
    monkeypatch.setattr(lmi, "_client_factory", _transport(handler))
    r = execute("lmi.lookup", _req())
    assert r.status == "ok" and seen["url"] == "https://calricula.test/api/lmi/search?q=registered+nurse"
    assert "authorization" not in seen["headers"] and "cookie" not in seen["headers"]
    assert r.coverage.retrieved == 2 and r.provenance.source_mode == "live" and r.provenance.effective_period == "2024"
    assert r.evidence_refs == ["calricula:lmi:wage:29-1141:Los Angeles-Long Beach-Anaheim, CA:2024", "calricula:lmi:projection:29-1141:California:2022-2032"]


@pytest.mark.parametrize("fail,code", [(lambda req: httpx.Response(500, text="boom secret"), "upstream_error"),
                                       (lambda req: (_ for _ in ()).throw(httpx.ReadTimeout("slow")), "upstream_timeout")])
def test_upstream_failures_are_typed_and_redacted(monkeypatch, fail, code):
    monkeypatch.setattr(settings, "CALRICULA_API_ORIGIN", "https://calricula.test")
    monkeypatch.setattr(lmi, "_client_factory", _transport(fail))
    r = execute("lmi.lookup", _req())
    assert r.status == "unavailable" and r.errors[0].code == code and "secret" not in r.errors[0].safe_message


def test_soc_filter_keeps_only_matching_rows(monkeypatch):
    monkeypatch.setattr(settings, "CALRICULA_API_ORIGIN", "https://calricula.test")
    doc = {"wages": SAMPLE["wages"] + [{**SAMPLE["wages"][0], "soc_code": "29-2061", "occupation_title": "LVN"}], "projections": []}
    monkeypatch.setattr(lmi, "_client_factory", _transport(lambda req: httpx.Response(200, json=doc)))
    r = execute("lmi.lookup", _req(soc_code="29-1141"))
    assert [w["soc_code"] for w in r.data["wages"]] == ["29-1141"]


def test_replay_serves_fixture_without_network(monkeypatch):
    monkeypatch.setattr(settings, "CALRICULA_API_ORIGIN", "https://calricula.test")
    monkeypatch.setattr(settings, "CONNECTOR_REPLAY", True)
    monkeypatch.setattr(lmi, "_client_factory", lambda: (_ for _ in ()).throw(AssertionError("network used")))
    r = execute("lmi.lookup", _req())
    assert r.status == "ok" and r.provenance.source_mode == "replay" and r.data["wages"]
```

`backend/tests/test_chat_workforce.py`:
```python
import httpx

from app.chat.model_gateway import Draft, FakeGateway
from app.chat.pipeline import PipelineInput, run_pipeline
from app.chat.slots import ResolvedScope
from app.chat.validate import check
from app.connectors import lmi
from app.connectors.registry import execute
from app.core.config import settings
from app.identity.principal import Principal
from tests.test_lmi_connector import SAMPLE


def _inp(q):
    return PipelineInput(question=q, principal=Principal(kind="public"), prior_scope=ResolvedScope(campus="LAMC"), defaults=ResolvedScope(), context_id="ctx")


def _wire(monkeypatch, doc=SAMPLE):
    monkeypatch.setattr(settings, "CALRICULA_API_ORIGIN", "https://calricula.test")
    monkeypatch.setattr(lmi, "_client_factory", lambda: httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=doc)), base_url="https://calricula.test"))


def test_workforce_question_yields_wage_and_projection_evidence(monkeypatch):
    _wire(monkeypatch)
    ans = run_pipeline(_inp("What is the salary for a registered nurse?"), executor=execute, gateway=FakeGateway(), emit=lambda *a: None)
    assert ans.route == "workforce" and ans.completeness == "complete"
    kinds = {c.data.get("type") for c in ans.cards}
    assert kinds == {"lmi_wage", "lmi_projection"}
    wage = next(c for c in ans.citations if ":wage:" in c.evidence_id)
    assert wage.source_period == "2024"


def test_wage_and_growth_claims_not_in_evidence_are_withheld(monkeypatch):
    _wire(monkeypatch)
    ok = FakeGateway(lambda g: Draft(answer="Median pay is $129,170 a year; employment is projected to grow 9.1% by 2032.", cited_ids=[e["evidence_id"] for e in g.evidence]))
    ans = run_pipeline(_inp("nurse wage"), executor=execute, gateway=ok, emit=lambda *a: None)
    assert not any(w.code == "unsupported_claim_withheld" for w in ans.warnings)
    bad = FakeGateway(lambda g: Draft(answer="Median pay is $150,000 a year and jobs grow 25%.", cited_ids=[e["evidence_id"] for e in g.evidence]))
    ans = run_pipeline(_inp("nurse wage"), executor=execute, gateway=bad, emit=lambda *a: None)
    w = [w for w in ans.warnings if w.code == "unsupported_claim_withheld"]
    assert w and "150,000" in w[0].message and "25" in w[0].message


def test_workforce_unconfigured_origin_is_explicit(monkeypatch):
    monkeypatch.setattr(settings, "CALRICULA_API_ORIGIN", None)
    ans = run_pipeline(_inp("nurse salary"), executor=execute, gateway=FakeGateway(), emit=lambda *a: None)
    assert any(w.code == "unconfigured" and w.source_id == "calricula_lmi" for w in ans.warnings) and ans.completeness != "complete"


def test_workforce_validate_rules_directly():
    ev = {"calricula:lmi:wage:x": {"fields": {"annual_median": 129170.0, "hourly_median": 62.1, "percent_change": None}},
          "calricula:lmi:projection:x": {"fields": {"percent_change": 9.1}}}
    _, reasons = check(Draft(answer="$129,170 per year, $62.10 an hour, up 9.1%.", cited_ids=list(ev)), ev, "workforce")
    assert reasons == []
    _, reasons = check(Draft(answer="$99,000 per year, up 12%.", cited_ids=list(ev)), ev, "workforce")
    assert any("99,000" in r for r in reasons) and any("12" in r for r in reasons)
```

Fixture `fixtures/synthetic/calricula_lmi/lmi.lookup/success.json`: the `SAMPLE` document above as plain JSON (the in-process connector reads it directly; it is not a CLI outcome envelope).

- [ ] **Step 2: Run** `cd backend && python -m pytest tests/test_lmi_connector.py tests/test_chat_workforce.py -q --no-cov` → FAIL (module missing / KeyError `lmi.lookup`)

- [ ] **Step 3: Implement**

`backend/app/core/config.py` — add near the connector settings: `CALRICULA_API_ORIGIN: str | None = None  # e.g. https://calricula.example.edu (no path); enables lmi.lookup`.

`backend/app/connectors/lmi.py`:
```python
"""lmi.lookup: labor-market wages and projections through Calricula's public LMI route.

A typed HTTP exchange with the host application (never its database): the
connector calls `GET {CALRICULA_API_ORIGIN}/api/lmi/search?q=` with no
credentials (the route is public), filters by SOC code when asked, and returns
a typed result whose evidence entries carry the release period, geography,
denominator and known limits so every wage claim can be cited precisely.
"""
import json
import pathlib
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote_plus

import httpx
from sqlmodel import Session

from app.connectors.contracts import ConnectorError, ConnectorRequest, ConnectorResult, Coverage, Provenance
from app.core.config import settings

FIXTURE = pathlib.Path(__file__).resolve().parents[3] / "fixtures" / "synthetic" / "calricula_lmi" / "lmi.lookup" / "success.json"
WAGE_LIMITS = "OEWS survey estimate; excludes self-employed; median/mean of hourly wages, annual = hourly x 2080"
PROJECTION_LIMITS = "Long-term occupational projection; percent change over the stated period"


def _client_factory() -> httpx.Client:
    return httpx.Client(base_url=settings.CALRICULA_API_ORIGIN or "", timeout=httpx.Timeout(10.0), follow_redirects=False)


def _failure(scope: dict, status: str, code: str, message: str, *, mode: str = "live") -> ConnectorResult:
    return ConnectorResult(status=status, data=None, evidence_refs=[], provenance=Provenance(source_mode=mode, connector_version=settings.APP_VERSION),
                           coverage=Coverage(scope=scope, expected=None, retrieved=0, complete=None, truncated=False),
                           errors=[ConnectorError(code=code, retryable=status == "unavailable", safe_message=message)])


def wage_ref(w: dict) -> str:
    return f"calricula:lmi:wage:{w.get('soc_code')}:{w.get('area')}:{w.get('year')}"


def projection_ref(p: dict) -> str:
    return f"calricula:lmi:projection:{p.get('soc_code')}:{p.get('area')}:{p.get('period')}"


def _fetch(query: str) -> dict[str, Any]:
    with _client_factory() as client:
        resp = client.get(f"/api/lmi/search?q={quote_plus(query)}", headers={"Accept": "application/json"})
    if resp.status_code >= 400:
        raise httpx.HTTPStatusError("upstream", request=resp.request, response=resp)
    return resp.json()


def execute_operation(request: ConnectorRequest, session: Session | None) -> ConnectorResult:
    scope = request.scope.model_dump(exclude_none=True)
    if not settings.CALRICULA_API_ORIGIN:
        return _failure(scope, "unconfigured", "origin_missing", "CALRICULA_API_ORIGIN is not configured")
    query = str(request.parameters["query"])
    soc = request.parameters.get("soc_code")
    mode = "live"
    try:
        if settings.CONNECTOR_REPLAY:
            doc, mode = json.loads(FIXTURE.read_text()), "replay"
        else:
            doc = _fetch(query)
    except httpx.TimeoutException:
        return _failure(scope, "unavailable", "upstream_timeout", "Calricula LMI did not answer in time")
    except (httpx.HTTPError, ValueError):
        return _failure(scope, "unavailable", "upstream_error", "Calricula LMI returned an error")
    wages = [w for w in doc.get("wages") or [] if isinstance(w, dict) and (not soc or w.get("soc_code") == soc)]
    projections = [p for p in doc.get("projections") or [] if isinstance(p, dict) and (not soc or p.get("soc_code") == soc)]
    years = sorted({str(w.get("year")) for w in wages if w.get("year")})
    data = {"query": query, "wages": wages, "projections": projections}
    return ConnectorResult(status="ok", data=data, evidence_refs=[wage_ref(w) for w in wages] + [projection_ref(p) for p in projections],
                           provenance=Provenance(source_url=f"{settings.CALRICULA_API_ORIGIN}/api/lmi/search", source_mode=mode,
                                                 observed_at=datetime.now(timezone.utc) if mode == "live" else None,
                                                 effective_period=years[-1] if years else None, connector_version=settings.APP_VERSION),
                           coverage=Coverage(scope={**scope, "query": query, **({"soc_code": soc} if soc else {})}, expected=None,
                                             retrieved=len(wages) + len(projections), complete=None, truncated=False))
```
(Check `Provenance.observed_at`'s type in `contracts.py` — if it is `str`, pass `.isoformat()`.)

`backend/app/connectors/operations/lmi.py`:
```python
"""lmi.lookup: served in-process by app.connectors.lmi (typed HTTP exchange with Calricula)."""
from app.connectors.registry import Operation, register

register(Operation(name="lmi.lookup", connector_id="calricula_lmi", command_path="-", envelope="bespoke", data_source="live",
                   required={"query": r"[\w .,&/-]{2,80}"}, optional={"soc_code": r"\d{2}-\d{4}"},
                   argv=lambda p: [],
                   retrieved_from=lambda d: len(d.get("wages") or []) + len(d.get("projections") or []) if isinstance(d, dict) else 0,
                   evidence=lambda p, d: ([f"calricula:lmi:wage:{w.get('soc_code')}:{w.get('area')}:{w.get('year')}" for w in d.get("wages") or []] +
                                          [f"calricula:lmi:projection:{q.get('soc_code')}:{q.get('area')}:{q.get('period')}" for q in d.get("projections") or []])
                   if isinstance(d, dict) else []))
```
`registry.py`: `from app.connectors import lmi as lmi_connector` → `IN_PROCESS["calricula_lmi"] = lmi_connector.execute_operation`; add `lmi` to the operations import line at the bottom. Note `execute()` checks `request.freshness == "live_required" and op.data_source == "local"` only; `data_source="live"` is fine.

`cards.py` branch:
```python
    elif op == "lmi.lookup":
        d = r.data
        period = r.provenance.effective_period
        for w in d.get("wages") or []:
            out.append({"evidence_id": f"calricula:lmi:wage:{w.get('soc_code')}:{w.get('area')}:{w.get('year')}", "kind": "evidence",
                        "summary": f"{w.get('occupation_title')} ({w.get('soc_code')}) in {w.get('area')}, {w.get('year')}: "
                                   f"median ${_money(w.get('annual_median'))}/year (${_money(w.get('hourly_median'))}/hour), employment {w.get('employment')}",
                        "fields": {"soc_code": w.get("soc_code"), "occupation_title": w.get("occupation_title"), "geography": w.get("area"),
                                   "source_period": str(w.get("year")), "denominator": "employment", "limits": "OEWS estimate; excludes self-employed",
                                   "annual_median": w.get("annual_median"), "annual_mean": w.get("annual_mean"), "hourly_median": w.get("hourly_median"),
                                   "employment": w.get("employment")},
                        "source_period": str(w.get("year")), "observed_at": obs, "url": r.provenance.source_url, "card": {"type": "lmi_wage", **w}})
        for p in d.get("projections") or []:
            out.append({"evidence_id": f"calricula:lmi:projection:{p.get('soc_code')}:{p.get('area')}:{p.get('period')}", "kind": "evidence",
                        "summary": f"{p.get('occupation_title')} ({p.get('soc_code')}) in {p.get('area')}, {p.get('period')}: "
                                   f"{p.get('percent_change')}% change ({p.get('emp_base')} to {p.get('emp_proj')})",
                        "fields": {"soc_code": p.get("soc_code"), "occupation_title": p.get("occupation_title"), "geography": p.get("area"),
                                   "source_period": p.get("period"), "denominator": "base-year employment", "limits": "long-term projection",
                                   "percent_change": p.get("percent_change"), "numeric_change": p.get("numeric_change"),
                                   "emp_base": p.get("emp_base"), "emp_proj": p.get("emp_proj"), "period": p.get("period")},
                        "source_period": p.get("period"), "observed_at": obs, "url": r.provenance.source_url, "card": {"type": "lmi_projection", **p}})
```
with helper `def _money(v): return f"{float(v):,.2f}".rstrip("0").rstrip(".") if v is not None else "unknown"`.

`validate.py`:
```python
_MONEY = re.compile(r"\$\s?(\d[\d,]*(?:\.\d{1,2})?)")
_PERCENT = re.compile(r"\b(\d{1,3}(?:\.\d+)?)\s?%")
```
```python
    elif route == "workforce":
        money_ok = _nums(f.get(k) for f in fields for k in ("annual_median", "annual_mean", "hourly_median", "hourly_mean"))
        for m in _MONEY.findall(draft.answer):
            if float(m.replace(",", "")) not in money_ok:
                reasons.append(f"wage value ${m} not in evidence")
        pct_ok = _nums(f.get("percent_change") for f in fields)
        reasons += [f"growth value {p}% not in evidence" for p in _PERCENT.findall(draft.answer) if float(p) not in pct_ok]
```

`pipeline.py` — `SUPPORTED |= {"workforce"}`; plan branch:
```python
    if intent == "workforce":
        if not settings.CALRICULA_API_ORIGIN:
            return [], lambda op, data: [], [unconfigured("calricula_lmi", scope.campus or "?", "labor-market lookups")]
        query = re.sub(r"\b(what|is|the|are|for|a|an|salary|wage|wages|pay|job outlook|employment|of|salario|empleo|cuánto|cuanto|gana|un|una)\b", " ", q, flags=re.I)
        query = re.sub(r"[^\w .,&/-]", " ", query)
        query = re.sub(r"\s+", " ", query).strip()[:80] or q[:80]
        return [("lmi.lookup", {"query": query})], lambda op, data: [], []
```
(`from app.core.config import settings` at the top.) Also `ConnectorRequest.scope` for `lmi.lookup` may include `geography` later; not in P1b-1.

`connectors/data_families.yaml`: set the `S9`/LMI family entry to `status: implemented_tested` with `operation: lmi.lookup`, `reason: "typed HTTP exchange with Calricula /api/lmi/search (P1b-1 Task 5)"`; run `cd backend && python ../scripts/export_schemas.py && git diff --exit-code -- ../contracts/schemas` (no schema change expected — the contracts are unchanged) and `python -m pytest tests/test_inventory.py -q --no-cov` (the inventory test reads the YAML).

- [ ] **Step 4: Run** `cd backend && python -m pytest tests/test_lmi_connector.py tests/test_chat_workforce.py tests/test_registry.py tests/test_operation_fixtures.py tests/test_inventory.py -q --no-cov` → pass. If `test_operation_fixtures.py` iterates every registered operation expecting a CLI fixture envelope, exclude in-process connectors the way it already excludes `campus_corpus` (read the test; follow its existing exclusion).

- [ ] **Step 5: Commit** — `feat(chat): lmi.lookup in-process connector over Calricula's LMI route; workforce route with wage/growth claim checks`

---

