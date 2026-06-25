#!/usr/bin/env python3
"""
WS-2b live smoke test for the managed File Search Stores RAG path.

CI cannot exercise the live Gemini File Search API (no key), so run this ONCE
against a real key before relying on the migration in production:

    cd backend
    GOOGLE_API_KEY=your-key python -m scripts.smoke_test_file_search

It exercises the exact code paths CI can't:
  1. FileSearchService._ensure_store()  -> get-or-create the persistent store
  2. upload_document()                  -> upload_to_file_search_store + poll
  3. generate_with_rag()                -> FileSearch tool query + native citations
  4. delete_document()                  -> per-document delete (best-effort)

Exit code 0 = the end-to-end path works; non-zero = it failed (read the output).
Use --keep to leave the uploaded test document in the store.
"""
import argparse
import asyncio
import os
import sys
import tempfile

# Allow running as a module from the backend/ directory.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.file_search_service import FileSearchService  # noqa: E402


SAMPLE_DOC = (
    "Calricula Smoke Test Reference\n\n"
    "Title 5 section 55002.5 establishes that one semester unit of credit "
    "corresponds to a minimum of 48 hours of total student learning, applied "
    "across the 48-54 hour range. A standard 3-unit lecture course therefore "
    "schedules 3 lecture hours per week plus 6 hours of outside study.\n"
)
QUERY = "According to the reference, how many hours of student learning are in one semester unit?"


async def main(keep: bool) -> int:
    if not os.getenv("GOOGLE_API_KEY"):
        print("ERROR: set GOOGLE_API_KEY to run this smoke test.", file=sys.stderr)
        return 2

    svc = FileSearchService()
    print(f"Model: {svc.model_name}")

    store_name = svc._ensure_store()
    print(f"Store: {store_name}")

    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
        f.write(SAMPLE_DOC)
        tmp_path = f.name

    try:
        print("Importing test document into the store (indexing can take ~30-90s)...")
        meta = await svc.upload_document(
            tmp_path, display_name="smoke-test-doc", document_type="reference"
        )
        print(f"Imported document id: {meta.file_id}")

        print(f"\nQuery: {QUERY}")
        resp = await svc.generate_with_rag(QUERY)

        print(f"\nsuccess={resp.success}")
        if resp.error:
            print(f"error={resp.error}")
        print(f"\n--- Answer ---\n{resp.text}\n")
        print(f"--- Citations ({len(resp.citations)}) ---")
        for c in resp.citations:
            print(f"  - {c.source_file} (page={c.page_number})")
        print(f"\n--- Grounding metadata ---\n{resp.grounding_metadata}")

        ok = bool(resp.success and resp.citations)

        if not keep:
            print("\nCleaning up test document...")
            deleted = await svc.delete_document(meta.file_id)
            print(f"  per-document delete returned: {deleted}")

        print(f"\nSMOKE TEST {'PASSED' if ok else 'FAILED'}")
        return 0 if ok else 1
    finally:
        os.unlink(tmp_path)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="WS-2b File Search Stores live smoke test")
    ap.add_argument(
        "--keep", action="store_true",
        help="keep the uploaded test document in the store (skip cleanup)",
    )
    args = ap.parse_args()
    raise SystemExit(asyncio.run(main(args.keep)))
