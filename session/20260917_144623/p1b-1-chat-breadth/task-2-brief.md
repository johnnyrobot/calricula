### Task 2: Campus source configuration and explicit unconfigured states

**Files:**
- Create: `backend/app/chat/campuses.py`
- Test: `backend/tests/test_campuses.py`

**Interfaces:**
- Consumes: `app.evidence.crosswalk.load_seed()` (identities per `campus:<code>` canonical; namespaces `programmapper.site_content`, `assist.institution`).
- Produces: `CAMPUS_NAMES: dict[str, str]` (code → ASSIST-resolvable college name); `site_content_id(campus: str) -> str | None` (confirmed ProgramMapper site content id or None); `assist_name(campus: str) -> str | None`; `unconfigured(source_id: str, campus: str, what: str) -> AnswerWarning` — the warning every plan emits instead of a tool step when a campus lacks a source. Tasks 3–5 call these.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_campuses.py`:
```python
from app.chat.campuses import CAMPUS_NAMES, assist_name, site_content_id, unconfigured
from app.chat.slots import CAMPUSES


def test_every_campus_has_a_name_and_a_confirmed_site_content_id():
    assert set(CAMPUS_NAMES) == set(CAMPUSES)
    for code in CAMPUSES:
        assert site_content_id(code), code
        assert assist_name(code) == CAMPUS_NAMES[code]


def test_unknown_campus_is_unconfigured():
    assert site_content_id("XXXX") is None and assist_name("XXXX") is None
    w = unconfigured("programmapper", "XXXX", "program maps")
    assert w.code == "unconfigured" and w.source_id == "programmapper" and "XXXX" in w.message and "program maps" in w.message


def test_only_confirmed_identities_count(monkeypatch):
    import app.chat.campuses as m
    from app.evidence.crosswalk import Crosswalk, ExternalIdentity
    cw = Crosswalk()
    cw.add("campus:lamc", ExternalIdentity(namespace="programmapper.site_content", external_id="tent", status="tentative", source="t"))
    monkeypatch.setattr(m, "_crosswalk", lambda: cw)
    assert site_content_id("LAMC") is None
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_campuses.py -q --no-cov`
Expected: FAIL — `ModuleNotFoundError: app.chat.campuses`

- [ ] **Step 3: Implement**

`backend/app/chat/campuses.py`:
```python
"""Per-campus source configuration for the chat plans.

The nine LACCD colleges are always *selectable*; whether a plan can run for a
campus depends on which sources are configured for it. ProgramMapper site
content ids come from the crosswalk seed (confirmed identities only); ASSIST
resolves colleges by name. A campus without a source yields an explicit
`unconfigured` warning from the plan, never a silent empty answer.
"""
from functools import lru_cache

from app.chat.pipeline_types import AnswerWarning
from app.evidence.crosswalk import Crosswalk, load_seed

CAMPUS_NAMES = {
    "LACC": "Los Angeles City College", "ELAC": "East Los Angeles College", "LAHC": "Los Angeles Harbor College",
    "LAMC": "Los Angeles Mission College", "LAPC": "Los Angeles Pierce College", "LASC": "Los Angeles Southwest College",
    "LATTC": "Los Angeles Trade-Technical College", "LAVC": "Los Angeles Valley College", "WLAC": "West Los Angeles College",
}


@lru_cache(maxsize=1)
def _seed() -> Crosswalk:
    return load_seed()


def _crosswalk() -> Crosswalk:
    return _seed()


def _confirmed(campus: str, namespace: str) -> str | None:
    for ident in _crosswalk().identities(f"campus:{campus.lower()}"):
        if ident.namespace == namespace and ident.status == "confirmed" and ident.external_id:
            return ident.external_id
    return None


def site_content_id(campus: str) -> str | None:
    return _confirmed(campus, "programmapper.site_content")


def assist_name(campus: str) -> str | None:
    return CAMPUS_NAMES.get(campus)


def unconfigured(source_id: str, campus: str, what: str) -> AnswerWarning:
    return AnswerWarning(code="unconfigured", source_id=source_id, message=f"{what} are not configured for {campus}")
```

`AnswerWarning` currently lives in `pipeline.py`, which will import `campuses.py` (a cycle). Move the three small answer models out: create `backend/app/chat/pipeline_types.py` containing `CardKind`, `Citation`, `Card`, `AnswerWarning` exactly as they are in `pipeline.py` today (lines 24–47), and in `pipeline.py` replace those definitions with `from app.chat.pipeline_types import AnswerWarning, Card, CardKind, Citation  # noqa: F401` (keep the re-export so existing imports `from app.chat.pipeline import Card` keep working).

- [ ] **Step 4: Run** `cd backend && python -m pytest tests/test_campuses.py tests/test_chat_pipeline.py tests/test_crosswalk.py -q --no-cov` → pass

- [ ] **Step 5: Commit** — `feat(chat): per-campus source configuration with explicit unconfigured warnings`

---

