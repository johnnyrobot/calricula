"""
Characterization tests for Firebase auth (WS-0 safety net).

Pin CURRENT behavior of ``verify_firebase_token`` BEFORE the WS-1 dependency bump
(firebase-admin 6.4 -> 7.x, plus the Starlette / python-jose / python-multipart
CVE fixes). These assert the auth contract as it is TODAY so any regression in
the upgrade is caught -- especially the fail-closed behavior when Firebase is not
configured (an auth-bypass guard hardened in a recent commit).

Runnable in isolation with:

    cd backend && python -m pytest tests/test_auth_characterization.py --noconftest
"""
import pytest
from fastapi import HTTPException
from firebase_admin import auth

from app.core import firebase as fb


@pytest.fixture(autouse=True)
def _isolate_firebase_globals(monkeypatch):
    """Each test starts unconfigured, non-dev, non-demo. monkeypatch auto-restores."""
    monkeypatch.setattr(fb.settings, "AUTH_DEV_MODE", False, raising=False)
    monkeypatch.setattr(fb.settings, "DEMO_MODE", False, raising=False)
    monkeypatch.setattr(fb.settings, "FIREBASE_SERVICE_ACCOUNT_PATH", None, raising=False)
    monkeypatch.setattr(fb, "_firebase_app", None, raising=False)
    yield


def test_dev_mode_token_maps_to_seed_user(monkeypatch):
    """With AUTH_DEV_MODE on, well-known dev tokens map to seed users (no Firebase call)."""
    monkeypatch.setattr(fb.settings, "AUTH_DEV_MODE", True)
    out = fb.verify_firebase_token("dev-faculty-001")
    assert out["uid"] == "test_faculty_001"
    assert out["email"] == "faculty@calricula.com"
    assert out["email_verified"] is True


def test_unconfigured_firebase_fails_closed_when_not_dev():
    """No Firebase app + AUTH_DEV_MODE off => fail closed (503), never authenticate."""
    with pytest.raises(HTTPException) as exc:
        fb.verify_firebase_token("any-token")
    assert exc.value.status_code == 503


def test_invalid_token_maps_to_401(monkeypatch):
    monkeypatch.setattr(fb, "_firebase_app", object())  # pretend Firebase configured

    def _raise(_token):
        raise auth.InvalidIdTokenError("invalid token")

    monkeypatch.setattr(fb.auth, "verify_id_token", _raise)
    with pytest.raises(HTTPException) as exc:
        fb.verify_firebase_token("bad-token")
    assert exc.value.status_code == 401


def test_expired_token_maps_to_401(monkeypatch):
    monkeypatch.setattr(fb, "_firebase_app", object())

    def _raise(_token):
        raise auth.ExpiredIdTokenError("expired token", None)

    monkeypatch.setattr(fb.auth, "verify_id_token", _raise)
    with pytest.raises(HTTPException) as exc:
        fb.verify_firebase_token("expired-token")
    assert exc.value.status_code == 401
