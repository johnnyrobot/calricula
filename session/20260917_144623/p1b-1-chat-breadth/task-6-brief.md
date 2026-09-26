### Task 6: Public-chat policy — disabled by default, per-IP daily limit, question cap

**Files:**
- Modify: `backend/app/core/config.py` (`PUBLIC_CHAT_ENABLED = False`, `RATE_LIMIT_PUBLIC_DAILY: str = "200/day"`)
- Modify: `backend/app/core/ratelimit.py` (`message_limit`)
- Modify: `backend/app/core/deps.py` (`public_chat_gate`)
- Modify: `backend/app/api/chat.py` (`MAX_QUESTION_CHARS = 4096`; every route depends on `public_chat_gate`)
- Modify: `backend/tests/conftest.py` (preset `RATE_LIMIT_PUBLIC_DAILY=100000/day`, `PUBLIC_CHAT_ENABLED=true` for the suite, same restore pattern as the existing presets)
- Modify: `README.md` (settings table), `.env.example`
- Test: `backend/tests/test_public_chat_policy.py`

**Interfaces:**
- Produces: `deps.public_chat_gate(principal: Principal = Depends(get_principal)) -> Principal` — raises `HTTPException(403, "public_chat_disabled")` when `principal.kind == "public"` and `not settings.PUBLIC_CHAT_ENABLED`; `ratelimit.message_limit(key) -> str` returns `f"{RATE_LIMIT_PUBLIC};{RATE_LIMIT_PUBLIC_DAILY}"` for non-user keys (slowapi accepts `;`-separated multiple limits).

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_public_chat_policy.py`:
```python
import pytest
from app.core.config import Settings, settings
from app.core.ratelimit import message_limit


def _msg(ctx="ctx"):
    return {"conversation_id": None, "workspace_id": None, "context_id": ctx, "question": "library hours", "language": "en"}


def test_public_chat_is_off_by_default(monkeypatch):
    monkeypatch.delenv("PUBLIC_CHAT_ENABLED", raising=False)  # conftest presets it to true for the suite
    assert Settings(_env_file=None).PUBLIC_CHAT_ENABLED is False


def test_public_principal_is_refused_when_disabled(client, monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_CHAT_ENABLED", False)
    r = client.post("/v1/chat/messages", json=_msg())
    assert r.status_code == 403 and r.json()["detail"] == "public_chat_disabled"
    assert client.get("/v1/chat/runs/00000000-0000-0000-0000-000000000000/events").status_code == 403
    assert client.post("/v1/chat/runs/00000000-0000-0000-0000-000000000000/cancel").status_code == 403


def test_dev_user_is_not_gated_when_public_chat_is_disabled(client, monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_CHAT_ENABLED", False)
    monkeypatch.setattr(settings, "AUTH_DEV_MODE", True)
    r = client.post("/v1/chat/messages", json=_msg(), headers={"Authorization": "Bearer dev-faculty-001"})
    assert r.status_code == 202


def test_public_limit_string_combines_minute_and_day(monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_PUBLIC", "20/minute")
    monkeypatch.setattr(settings, "RATE_LIMIT_PUBLIC_DAILY", "200/day")
    assert message_limit("127.0.0.1") == "20/minute;200/day"
    assert message_limit("user:abc") == settings.RATE_LIMIT_USER


def test_daily_limit_is_enforced_per_ip(client, monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_CHAT_ENABLED", True)
    monkeypatch.setattr(settings, "RATE_LIMIT_PUBLIC", "1000/minute")
    monkeypatch.setattr(settings, "RATE_LIMIT_PUBLIC_DAILY", "2/day")
    from app.core.ratelimit import limiter
    limiter.reset()
    codes = [client.post("/v1/chat/messages", json=_msg()).status_code for _ in range(3)]
    assert codes == [202, 202, 429]


def test_question_cap_is_4096(client, monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_CHAT_ENABLED", True)
    r = client.post("/v1/chat/messages", json={**_msg(), "question": "x" * 4097})
    assert r.status_code == 413
    r = client.post("/v1/chat/messages", json={**_msg(), "question": "x" * 4096})
    assert r.status_code == 202
```
(Confirm the route prefix — `/v1/chat/...` — against how `app.main` mounts the chat router; existing `tests/test_chat_api.py` shows the exact paths. Confirm `limiter.reset()` exists in the installed slowapi; if not, monkeypatch a fresh `Limiter` the way the existing rate-limit test in `test_chat_api.py` does.)

- [ ] **Step 2: Run** → FAIL (`PUBLIC_CHAT_ENABLED` True; no 403; limit string lacks `;`)

- [ ] **Step 3: Implement**

`config.py`: `PUBLIC_CHAT_ENABLED: bool = False` (comment: owner decision 2026-09-19 — deployers opt in) and `RATE_LIMIT_PUBLIC_DAILY: str = "200/day"`.

`ratelimit.py`:
```python
def message_limit(key: str) -> str:
    if key.startswith("user:"):
        return settings.RATE_LIMIT_USER
    return f"{settings.RATE_LIMIT_PUBLIC};{settings.RATE_LIMIT_PUBLIC_DAILY}"
```

`deps.py`:
```python
def public_chat_gate(principal: Principal = Depends(get_principal)) -> Principal:
    """Public (unauthenticated) chat is opt-in per deployment; users are never gated here."""
    if principal.kind == "public" and not settings.PUBLIC_CHAT_ENABLED:
        raise HTTPException(403, "public_chat_disabled")
    return principal
```
(import `settings`.) `api/chat.py`: `MAX_QUESTION_CHARS = 4096`; replace `Depends(get_principal)` with `Depends(public_chat_gate)` on `post_message`, `run_events`, `cancel_run`.

`conftest.py`: extend the env preset block with `RATE_LIMIT_PUBLIC_DAILY` → `"100000/day"` and `PUBLIC_CHAT_ENABLED` → `"true"` (restored like the others) so the existing public-chat tests keep passing.

`README.md` settings table + `.env.example`: `PUBLIC_CHAT_ENABLED=false`, `RATE_LIMIT_PUBLIC=20/minute`, `RATE_LIMIT_PUBLIC_DAILY=200/day`, `CALRICULA_API_ORIGIN=` with one-line explanations.

- [ ] **Step 4: Run the full backend suite** `cd backend && python -m pytest -q` → green, coverage ≥ 70 %

- [ ] **Step 5: Commit** — `feat(chat): public chat opt-in per deployment with per-IP minute and daily limits; 4 KB question cap`

---

