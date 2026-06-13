"""
Calricula - RAG Document Seed Data
Pre-loads institutional documents into Google File Search for RAG.

This script uploads regulatory and reference documents (PCAH, Title 5, CCN guidelines)
to Google's File API for use in RAG-powered AI assistance.
"""

import asyncio
import os
import sys

# Add backend to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.file_search_service import FileSearchService

# Path to knowledge base documents
# The knowledge-base is in the calricula_docs directory
# Path from backend/seeds/ to calricula/calricula_docs/knowledge-base:
#   seeds -> backend -> calricula -> calricula_docs -> knowledge-base
KNOWLEDGE_BASE_PATH = "../../calricula_docs/knowledge-base"

# Documents to pre-load into RAG
# These are community college regulatory documents that the AI uses
# to provide accurate compliance guidance
DOCUMENTS_TO_PRELOAD = [
    {
        "file": "program-course-approval-handbook-8th-edition.pdf",
        "display_name": "PCAH - Program and Course Approval Handbook (8th Edition)",
        "document_type": "regulation",
        "tags": ["PCAH", "curriculum", "approval", "CCCCO"]
    },
    {
        "file": "ccn/ccc-curriculum-submission-approval-tech-manual.pdf",
        "display_name": "CCC Curriculum Submission Technical Manual",
        "document_type": "regulation",
        "tags": ["submission", "technical", "CCCCO"]
    },
    {
        "file": "title-5-prerequisites-guidelines-55003-a11y.pdf",
        "display_name": "Title 5 Prerequisites Guidelines (55003)",
        "document_type": "regulation",
        "tags": ["Title5", "prerequisites", "55003", "content-review"]
    },
    {
        "file": "final-top-code-manual-2023edit-4-a11y.pdf",
        "display_name": "TOP Code Manual (2023)",
        "document_type": "standard",
        "tags": ["TOP", "codes", "taxonomy", "classification"]
    },
    {
        "file": "ccn/ess-25-67-ccn-phase-2-guidance-a11y.pdf",
        "display_name": "Common Course Numbering Phase 2 Guidance",
        "document_type": "regulation",
        "tags": ["CCN", "AB1111", "common-numbering", "C-ID"]
    },
]


async def seed_rag_documents(upload: bool = False, verbose: bool = True):
    """
    Seed RAG documents into Google File Search.

    This requires:
    1. GOOGLE_API_KEY environment variable to be set
    2. The google-genai SDK to be installed
    3. Documents to exist in the knowledge-base directory

    Args:
        upload: If True, actually upload documents to Google File API.
                If False (default), just check if documents exist.
        verbose: If True, print detailed progress messages.

    Returns:
        Tuple of (found_count, missing_count, uploaded_count)
    """
    if verbose:
        print("     Checking knowledge base documents...")

    # Get absolute path to knowledge base
    script_dir = os.path.dirname(os.path.abspath(__file__))
    kb_path = os.path.normpath(os.path.join(script_dir, KNOWLEDGE_BASE_PATH))

    found = 0
    missing = 0
    uploaded = 0
    errors = []

    # Initialize file search service if uploading
    file_search = None
    if upload:
        try:
            file_search = FileSearchService()
            if verbose:
                print("     FileSearchService initialized successfully")
        except Exception as e:
            print(f"     ERROR: Failed to initialize FileSearchService: {e}")
            print("     Falling back to check-only mode (no uploads)")
            upload = False

    for doc in DOCUMENTS_TO_PRELOAD:
        file_path = os.path.join(kb_path, doc["file"])

        if os.path.exists(file_path):
            found += 1

            if upload and file_search:
                try:
                    if verbose:
                        print(f"       Uploading: {doc['display_name']}...")

                    metadata = await file_search.upload_document(
                        file_path=file_path,
                        display_name=doc["display_name"],
                        document_type=doc["document_type"],
                        tags=doc.get("tags", []),
                    )

                    uploaded += 1
                    if verbose:
                        print(f"       ✓ Uploaded: {metadata.display_name} (ID: {metadata.file_id})")

                except Exception as e:
                    errors.append((doc["file"], str(e)))
                    if verbose:
                        print(f"       ✗ Failed to upload {doc['file']}: {e}")
            else:
                if verbose:
                    print(f"       Found: {doc['display_name']}")
        else:
            if verbose:
                print(f"       MISSING: {doc['file']}")
            missing += 1

    # Print summary
    if verbose:
        print()
        print(f"     Summary: {found} found, {missing} missing")
        if upload:
            print(f"     Uploaded: {uploaded} documents")
            if errors:
                print(f"     Errors: {len(errors)} documents failed to upload")
                for filename, error in errors:
                    print(f"       - {filename}: {error}")

        if missing > 0:
            print()
            print("     Note: Missing documents will not be available for RAG.")
            print(f"     Expected location: {kb_path}")
            print()
            print("     To obtain these documents, download from the California")
            print("     Community Colleges Chancellor's Office (CCCCO) website.")

    return found, missing, uploaded


def main():
    """Command-line entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Seed RAG documents into Google File Search"
    )
    parser.add_argument(
        "--upload",
        action="store_true",
        help="Actually upload documents to Google File API (requires GOOGLE_API_KEY)"
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress verbose output"
    )

    args = parser.parse_args()

    asyncio.run(seed_rag_documents(
        upload=args.upload,
        verbose=not args.quiet
    ))


if __name__ == "__main__":
    main()
