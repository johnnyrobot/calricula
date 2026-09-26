### Task 1: Settings, production guard and status endpoint

**Files:**
- Modify: `backend/app/core/config.py` (after line 82, inside `_enforce_production_safety` at line 92)
- Create: `backend/app/api/routes/applicationx.py` (status endpoint only in this task)
- Modify: `backend/app/main.py:195` import list and add `include_router` after line 240
- Test: `backend/tests/test_applicationx_broker.py`

**Interfaces:**
- Settings: `APPLICATIONX_EMBED_ENABLED: bool = False`, `APPLICATIONX_API_ORIGIN: Optional[str] = None`, `APPLICATIONX_ORGANIZATION_REF: Optional[str] = None`, `APPLICATIONX_CAMPUS_REF: Optional[str] = None`, `APPLICATIONX_SERVICE_TOKEN: Optional[str] = None`, `APPLICATIONX_TIMEOUT_SECONDS: float = 20.0`, `APPLICATIONX_STANDALONE_URL: Optional[str] = None`.
- `GET /api/applicationx/status` (auth required) → `{"enabled": bool, "organization_ref": str|None, "campus_ref": str|None, "standalone_url": str|None, "api_version": str|None}`; `enabled` is true only when the flag is on **and** origin, organization and campus refs are set.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_applicationx_broker.py` (first section):
```python
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.deps import get_current_user
from app.core.config import settings
from app.models.user import User, UserRole
import uuid

def _user(role=UserRole.FACULTY):
    return User(id=uuid.uuid4(), email="faculty@calricula.com", full_name="F", role=role, auth_subject="test_faculty_001", auth_issuer="dev")

@pytest.fixture
def as_faculty():
    app.dependency_overrides[get_current_user] = lambda: _user()
    yield TestClient(app)
    app.dependency_overrides.pop(get_current_user, None)

@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(settings, "APPLICATIONX_EMBED_ENABLED", True)
    monkeypatch.setattr(settings, "APPLICATIONX_API_ORIGIN", "https://ax.example.test")
    monkeypatch.setattr(settings, "APPLICATIONX_ORGANIZATION_REF", "lamc")
    monkeypatch.setattr(settings, "APPLICATIONX_CAMPUS_REF", "LAMC")
    monkeypatch.setattr(settings, "APPLICATIONX_STANDALONE_URL", "https://ax.example.test/app")

def test_status_requires_auth():
    assert TestClient(app).get("/api/applicationx/status").status_code in (401, 403, 503)

def test_status_disabled_by_default(as_faculty):
    body = as_faculty.get("/api/applicationx/status").json()
    assert body == {"enabled": False, "organization_ref": None, "campus_ref": None, "standalone_url": None, "api_version": None}

def test_status_enabled_only_when_fully_configured(as_faculty, configured, monkeypatch):
    assert as_faculty.get("/api/applicationx/status").json()["enabled"] is True
    monkeypatch.setattr(settings, "APPLICATIONX_CAMPUS_REF", None)
    assert as_faculty.get("/api/applicationx/status").json()["enabled"] is False

def test_production_requires_https_origin_when_enabled():
    from app.core.config import Settings
    with pytest.raises(Exception):
        Settings(_env_file=None, ENVIRONMENT="production", ALLOWED_HOSTS=["calricula.example"], APPLICATIONX_EMBED_ENABLED=True,
                 APPLICATIONX_API_ORIGIN="http://ax.internal", APPLICATIONX_ORGANIZATION_REF="lamc", APPLICATIONX_CAMPUS_REF="LAMC")
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_applicationx_broker.py -q --no-cov`
Expected: FAIL — 404 for `/api/applicationx/status` and `AttributeError` on settings

- [ ] **Step 3: Implement**

`backend/app/core/config.py` — add after `BLS_API_KEY` (line 82):
```python
    # ApplicationX embedded staff workspace (companion app broker)
    APPLICATIONX_EMBED_ENABLED: bool = False
    APPLICATIONX_API_ORIGIN: Optional[str] = None       # e.g. https://ax.example.edu (no path)
    APPLICATIONX_ORGANIZATION_REF: Optional[str] = None # ApplicationX organization slug for this deployment
    APPLICATIONX_CAMPUS_REF: Optional[str] = None       # e.g. LAMC
    APPLICATIONX_SERVICE_TOKEN: Optional[str] = None    # optional transport credential; never expands user scope
    APPLICATIONX_TIMEOUT_SECONDS: float = 20.0
    APPLICATIONX_STANDALONE_URL: Optional[str] = None

    @property
    def applicationx_ready(self) -> bool:
        return bool(self.APPLICATIONX_EMBED_ENABLED and self.APPLICATIONX_API_ORIGIN
                    and self.APPLICATIONX_ORGANIZATION_REF and self.APPLICATIONX_CAMPUS_REF)
```
and inside `_enforce_production_safety` (before `return self`):
```python
        if self.ENVIRONMENT == "production" and self.APPLICATIONX_EMBED_ENABLED:
            origin = self.APPLICATIONX_API_ORIGIN or ""
            if not origin.startswith("https://") or origin.rstrip("/").count("/") != 2:
                raise ValueError("APPLICATIONX_API_ORIGIN must be an https origin without a path in production")
```

`backend/app/api/routes/applicationx.py` (initial):
```python
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.core.config import settings
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter()

class StatusOut(BaseModel):
    enabled: bool
    organization_ref: str | None
    campus_ref: str | None
    standalone_url: str | None
    api_version: str | None

@router.get("/status", response_model=StatusOut)
async def status(current_user: User = Depends(get_current_user)) -> StatusOut:
    if not settings.applicationx_ready:
        return StatusOut(enabled=False, organization_ref=None, campus_ref=None, standalone_url=None, api_version=None)
    return StatusOut(enabled=True, organization_ref=settings.APPLICATIONX_ORGANIZATION_REF, campus_ref=settings.APPLICATIONX_CAMPUS_REF,
                     standalone_url=settings.APPLICATIONX_STANDALONE_URL, api_version=None)
```
`backend/app/main.py`: add `applicationx` to the import on line 195 and, after line 240,
`app.include_router(applicationx.router, prefix="/api/applicationx", tags=["ApplicationX"])`.

- [ ] **Step 4: Run tests** → 4 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/config.py backend/app/api/routes/applicationx.py backend/app/main.py backend/tests/test_applicationx_broker.py
git commit -m "feat(applicationx): embed settings, production guard and status endpoint

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

