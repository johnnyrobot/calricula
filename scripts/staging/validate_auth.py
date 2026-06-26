#!/usr/bin/env python3
"""
validate_auth.py - Staging auth validation for Calricula.

Exercises the real Firebase-backed auth dependency (`get_current_user`) over
HTTP against a running staging API:

  1. Public health endpoint        GET  /health                       -> 200
  2. Public reference endpoint     GET  /api/reference/ccn-standards   -> 200
  3. Protected endpoint, NO token  GET  /api/courses                   -> 401/403
  4. Protected endpoint, w/ token  GET  /api/courses  (Bearer <tok>)   -> 2xx

Reads config from the environment (no secrets hardcoded):
  API_BASE_URL        base URL of the staging API, e.g. https://staging-api.example.org
  FIREBASE_ID_TOKEN   a valid Firebase ID token for a provisioned staging user

Prints a table of endpoint / expected / actual and exits non-zero on any FAIL.

Usage:
  API_BASE_URL=https://staging-api.example.org \
  FIREBASE_ID_TOKEN=eyJhbG... \
    python scripts/staging/validate_auth.py
"""
import os
import sys

try:
    import httpx
except ImportError:  # pragma: no cover - httpx is a backend dependency
    print("ERROR: httpx is required. Activate the backend venv "
          "(pip install -r backend/requirements.txt).", file=sys.stderr)
    sys.exit(2)


TIMEOUT = float(os.getenv("VALIDATE_HTTP_TIMEOUT", "30"))


def _ok(actual: int, expected) -> bool:
    if isinstance(expected, (list, tuple, set)):
        return actual in expected
    if isinstance(expected, str) and expected.endswith("xx"):
        return actual // 100 == int(expected[0])
    return actual == expected


def main() -> int:
    base = os.getenv("API_BASE_URL")
    token = os.getenv("FIREBASE_ID_TOKEN")

    if not base:
        print("ERROR: API_BASE_URL is required "
              "(e.g. https://staging-api.example.org).", file=sys.stderr)
        return 2
    base = base.rstrip("/")

    if not token:
        print("ERROR: FIREBASE_ID_TOKEN is required (a valid Firebase ID token "
              "for a provisioned staging user).", file=sys.stderr)
        return 2

    auth_header = {"Authorization": f"Bearer {token}"}

    # name, method, path, headers, expected
    checks = [
        ("public health",          "GET", "/health",                     None,        200),
        ("public reference list",  "GET", "/api/reference/ccn-standards", None,        200),
        ("protected (no token)",   "GET", "/api/courses",                 None,        (401, 403)),
        ("protected (with token)", "GET", "/api/courses",                 auth_header, "2xx"),
    ]

    print("=" * 78)
    print(" Calricula :: Auth validation")
    print(f" API_BASE_URL: {base}")
    print("=" * 78)

    rows = []
    all_pass = True
    with httpx.Client(timeout=TIMEOUT, follow_redirects=True) as client:
        for name, method, path, headers, expected in checks:
            url = f"{base}{path}"
            try:
                resp = client.request(method, url, headers=headers)
                actual = resp.status_code
                passed = _ok(actual, expected)
            except Exception as exc:  # network/connection error
                actual = f"ERR:{type(exc).__name__}"
                passed = False
            all_pass = all_pass and passed
            exp_str = (expected if isinstance(expected, str)
                       else "/".join(str(e) for e in expected)
                       if isinstance(expected, (list, tuple, set)) else str(expected))
            rows.append((name, f"{method} {path}", exp_str, str(actual),
                         "PASS" if passed else "FAIL"))

    # --- render table ---
    headers_row = ("CHECK", "ENDPOINT", "EXPECT", "ACTUAL", "RESULT")
    widths = [max(len(r[i]) for r in (*rows, headers_row)) for i in range(5)]
    fmt = "  ".join("{:<" + str(w) + "}" for w in widths)
    print()
    print(fmt.format(*headers_row))
    print(fmt.format(*("-" * w for w in widths)))
    for r in rows:
        print(fmt.format(*r))
    print()

    if all_pass:
        print("AUTH: PASS")
        return 0
    print("AUTH: FAIL")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
