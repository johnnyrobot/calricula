"""
Characterization tests for the AI layer (WS-0 safety net).

These tests PIN the behavior of the Gemini integration. After WS-2a, BOTH
services use the unified ``google-genai`` SDK (the legacy ``google-generativeai``
package, EOL 2025-11-30, has been removed). The model IDs and the regex-based
citation scraping are still the pre-WS-2b values: the gemini-3.x bump and the
managed File Search Stores migration are WS-2b and will update these asserts on
purpose -- that is the point of a characterization test.
"""
import asyncio
from unittest.mock import MagicMock

from app.services import file_search_service as fss
from app.services import gemini_service as gs


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
# Unified SDK -- WS-2a collapsed both services onto google-genai.
# ---------------------------------------------------------------------------

def test_both_services_use_unified_sdk():
    """After WS-2a, both services import the unified google-genai SDK."""
    assert fss.genai.__name__ == "google.genai"  # migrated in WS-2a
    assert gs.genai.__name__ == "google.genai"  # unified GA SDK


# ---------------------------------------------------------------------------
# Unified-SDK configuration pattern -- WS-2a replaced configure()/GenerativeModel
# with a genai.Client constructed from the API key.
# ---------------------------------------------------------------------------

def test_client_construction_uses_api_key_and_model(monkeypatch):
    monkeypatch.setenv("GOOGLE_API_KEY", "test-key-not-real")
    fake_client_cls = MagicMock(name="Client")
    monkeypatch.setattr(fss.genai, "Client", fake_client_cls, raising=False)

    svc = fss.FileSearchService()
    svc._ensure_configured()

    fake_client_cls.assert_called_once()
    assert fake_client_cls.call_args.kwargs.get("api_key") == "test-key-not-real"
    # Model ID is unchanged by WS-2a (the gemini-3.x bump is WS-2b).
    assert svc.model_name == "gemini-2.5-flash"
    assert svc.client is fake_client_cls.return_value


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
