#!/usr/bin/env python3
"""
validate_ai.py - Staging AI/RAG validation for Calricula.

  *** THIS CALLS THE LIVE GEMINI API AND INCURS API COST. ***

Two checks, both against the real google-genai / Gemini path:

  1. generate_content : a minimal `GeminiService.generate_response()` call;
                        asserts a non-empty text response (success=True).
  2. File Search RAG  : invokes the existing, authoritative smoke test
                        `backend/scripts/smoke_test_file_search.py`
                        (store create -> upload -> grounded query -> citations).
                        This script does NOT duplicate it; it runs it.

Reads config from the environment (no secrets hardcoded):
  GOOGLE_API_KEY   a real Google API key with Gemini + File Search access
  GEMINI_MODEL     (optional) overrides the default model for the basic check

Flags:
  --skip-rag       run only the basic generate check (cheaper / faster)

Usage:
  GOOGLE_API_KEY=... python scripts/staging/validate_ai.py
  GOOGLE_API_KEY=... python scripts/staging/validate_ai.py --skip-rag

Exit code 0 = PASS, non-zero = FAIL.
"""
import asyncio
import os
import subprocess
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.abspath(os.path.join(_HERE, "..", ".."))
_BACKEND_DIR = os.path.join(_REPO_ROOT, "backend")

# Allow importing the backend app package (app.services.gemini_service, etc.).
sys.path.insert(0, _BACKEND_DIR)


async def _basic_generate() -> bool:
    print(">> [1/2] basic generate_content (GeminiService.generate_response)")
    try:
        from app.services.gemini_service import GeminiService
    except Exception as exc:
        print(f"   FAIL: could not import GeminiService: {exc}")
        return False

    svc = GeminiService()
    print(f"   model: {svc.model_name}")
    prompt = ("In one sentence, state the Title 5 minimum number of total "
              "student-learning hours per semester unit.")
    try:
        result = await svc.generate_response(prompt)
    except Exception as exc:
        print(f"   FAIL: generate_response raised: {exc}")
        return False

    text = (result or {}).get("text", "")
    success = bool((result or {}).get("success"))
    if success and text and text.strip():
        preview = text.strip().replace("\n", " ")
        print(f"   response (first 160 chars): {preview[:160]}")
        print("   PASS: non-empty response received")
        return True

    print(f"   FAIL: empty/failed response. success={success} "
          f"error={(result or {}).get('error')}")
    return False


def _file_search_rag() -> bool:
    print(">> [2/2] File Search Stores RAG smoke test "
          "(scripts.smoke_test_file_search)")
    print("   (this uploads a doc, runs a grounded query, and cleans up)")
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "scripts.smoke_test_file_search"],
            cwd=_BACKEND_DIR,
            env=os.environ.copy(),
            check=False,
        )
    except Exception as exc:
        print(f"   FAIL: could not launch smoke test: {exc}")
        return False
    if proc.returncode == 0:
        print("   PASS: RAG smoke test exited 0")
        return True
    print(f"   FAIL: RAG smoke test exited {proc.returncode}")
    return False


def main(argv) -> int:
    skip_rag = "--skip-rag" in argv

    if not os.getenv("GOOGLE_API_KEY"):
        print("ERROR: GOOGLE_API_KEY is required (a real key with Gemini + "
              "File Search access).", file=sys.stderr)
        return 2

    print("=" * 70)
    print(" Calricula :: AI / RAG validation")
    print(" WARNING: calls the LIVE Gemini API and INCURS COST.")
    print("=" * 70)

    basic_ok = asyncio.run(_basic_generate())
    print()

    if skip_rag:
        print("(--skip-rag) skipping File Search RAG smoke test")
        rag_ok = None
    else:
        rag_ok = _file_search_rag()
    print()

    print("-" * 70)
    print(f"  basic generate : {'PASS' if basic_ok else 'FAIL'}")
    if rag_ok is None:
        print("  file-search RAG: SKIPPED")
    else:
        print(f"  file-search RAG: {'PASS' if rag_ok else 'FAIL'}")
    print("-" * 70)

    ok = basic_ok and (rag_ok is None or rag_ok)
    print("AI/RAG: PASS" if ok else "AI/RAG: FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
