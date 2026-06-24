"""
Characterization tests for the AI layer (WS-0 safety net).

These tests PIN CURRENT BEHAVIOR of the Gemini integration *before* the WS-2
migration (legacy ``google-generativeai`` -> ``google-genai``, managed File
Search, and model-ID bumps to gemini-3.x). They intentionally assert the values
as they are TODAY. When WS-2 changes them, a maintainer updates these asserts on
purpose and sees exactly what changed -- that is the point of a characterization
test.

Runnable in isolation (no DB / no full-app import) with:

    cd backend && python -m pytest tests/test_ai_characterization.py --noconftest

The deprecated ``google-generativeai`` SDK is stubbed only if it is not installed
(CI installs it from requirements.txt; local/dev envs often lack it).
"""
import asyncio
import sys
import types
from unittest.mock import MagicMock

import pytest

# --- Stub the deprecated google-generativeai SDK only if it isn't importable ---
try:  # pragma: no cover - exercised differently per environment
    import google.generativeai  # noqa: F401
except Exception:  # ImportError (or partial-install error) -> inject a stub
    import google  # real namespace package (google.genai ships separately)

    _legacy = types.ModuleType("google.generativeai")
    _legacy.configure = MagicMock(name="configure")
    _legacy.GenerativeModel = MagicMock(name="GenerativeModel")
    _legacy.GenerationConfig = MagicMock(name="GenerationConfig")
    _legacy.upload_file = MagicMock(name="upload_file")
    _legacy.get_file = MagicMock(name="get_file")
    _legacy.delete_file = MagicMock(name="delete_file")
    sys.modules["google.generativeai"] = _legacy
    setattr(google, "generativeai", _legacy)


from app.services import file_search_service as fss  # noqa: E402
from app.services import gemini_service as gs  # noqa: E402


# ---------------------------------------------------------------------------
# Model-ID contract -- the values WS-2 must change on purpose.
# Both shut down 2026-10-16; replacements gemini-3.5-flash / gemini-3.1-flash-lite.
# ---------------------------------------------------------------------------

def test_file_search_service_default_model_id():
    """RAG service currently targets gemini-2.5-flash."""
    assert fss.FileSearchService().model_name == "gemini-2.5-flash"


def test_gemini_service_model_id():
    """Curriculum assistant currently targets gemini-2.5-flash-lite."""
    assert gs.GeminiService().model_name == "gemini-2.5-flash-lite"


# ---------------------------------------------------------------------------
# Dual-SDK split -- WS-2a collapses both services onto google-genai.
# ---------------------------------------------------------------------------

def test_dual_sdk_split_is_present():
    """file_search_service uses the LEGACY SDK; gemini_service uses the NEW SDK."""
    assert fss.genai.__name__ == "google.generativeai"  # deprecated, EOL 2025-11-30
    assert gs.genai.__name__ == "google.genai"  # unified GA SDK


# ---------------------------------------------------------------------------
# Legacy configuration pattern -- WS-2a replaces configure()/GenerativeModel.
# ---------------------------------------------------------------------------

def test_legacy_configure_and_model_construction(monkeypatch):
    monkeypatch.setenv("GOOGLE_API_KEY", "test-key-not-real")
    monkeypatch.setattr(fss.genai, "configure", MagicMock(), raising=False)
    monkeypatch.setattr(fss.genai, "GenerationConfig", MagicMock(), raising=False)
    fake_model_cls = MagicMock(name="GenerativeModel")
    monkeypatch.setattr(fss.genai, "GenerativeModel", fake_model_cls, raising=False)

    svc = fss.FileSearchService()
    svc._ensure_configured()

    fss.genai.configure.assert_called_once()
    assert fss.genai.configure.call_args.kwargs.get("api_key") == "test-key-not-real"
    fake_model_cls.assert_called_once()
    assert fake_model_cls.call_args.kwargs.get("model_name") == "gemini-2.5-flash"


# ---------------------------------------------------------------------------
# Citation extraction contract -- WS-2b replaces regex scraping with the
# managed File Search tool's native (page-level) citations.
# ---------------------------------------------------------------------------

def test_extract_citations_parses_source_and_section():
    svc = fss.FileSearchService()
    text = (
        "Per the handbook [Source: PCAH 8th Edition, Section: 3.2] and the "
        "regulation [Source: Title 5 55002.5]."
    )
    cites = svc._extract_citations(text, [])
    assert len(cites) == 2
    assert cites[0].source_file == "PCAH 8th Edition"
    assert cites[0].section == "3.2"
    assert cites[1].source_file == "Title 5 55002.5"
    assert cites[1].section is None


def test_extract_grounding_metadata_is_graceful_on_bare_response():
    svc = fss.FileSearchService()
    assert svc._extract_grounding_metadata(object()) is None


# ---------------------------------------------------------------------------
# New-SDK call shape (gemini_service) -- pin the response contract.
# ---------------------------------------------------------------------------

def test_generate_response_contract():
    svc = gs.GeminiService()
    fake_resp = MagicMock()
    fake_resp.text = "An active-voice catalog description."
    svc.client = MagicMock()
    svc.client.models.generate_content.return_value = fake_resp
    svc._configured = True  # skip real client init / API key

    result = asyncio.run(svc.generate_response("Draft a catalog description."))

    assert result["success"] is True
    assert result["text"] == "An active-voice catalog description."
    assert result["model"] == "gemini-2.5-flash-lite"
    assert (
        svc.client.models.generate_content.call_args.kwargs["model"]
        == "gemini-2.5-flash-lite"
    )
