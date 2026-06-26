#!/usr/bin/env bash
#
# validate_migrations.sh - Staging migration validation for Calricula.
#
# Runs the REAL Alembic migration path (the production source of truth) against
# the configured DATABASE_URL, asserts the key tables exist, then rehearses a
# downgrade-one + re-upgrade roundtrip.
#
#   *** THIS MUTATES THE DATABASE pointed at by DATABASE_URL ***
#   Point it at a FRESH, disposable STAGING database. NEVER production.
#
# Usage:
#   DATABASE_URL=postgresql://user:pass@host:5432/calricula_staging \
#     scripts/staging/validate_migrations.sh [--yes]
#
#   --yes / STAGING_CONFIRM=1   skip the interactive "are you sure" prompt
#                               (used by the orchestrator).
#
# Exit code 0 = PASS, non-zero = FAIL.
set -euo pipefail

# --- locate repo + backend -------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BACKEND_DIR="${REPO_ROOT}/backend"

# --- pretty helpers --------------------------------------------------------
red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }
bold()  { printf '\033[1m%s\033[0m\n' "$*"; }

fail() { red "FAIL: $*"; exit 1; }

# --- preconditions ---------------------------------------------------------
: "${DATABASE_URL:?DATABASE_URL is required (point it at a FRESH staging DB)}"

if [[ ! -f "${BACKEND_DIR}/alembic.ini" ]]; then
  fail "alembic.ini not found at ${BACKEND_DIR}/alembic.ini"
fi

command -v alembic >/dev/null 2>&1 || \
  fail "alembic not on PATH. Activate the backend venv: pip install -r backend/requirements.txt"

# Redact credentials when echoing the target.
SAFE_URL="$(printf '%s' "${DATABASE_URL}" | sed -E 's#(://[^:/@]+):[^@]*@#\1:****@#')"

bold "=========================================================="
bold " Calricula :: Migration validation (Alembic)"
bold "=========================================================="
yellow "Target DATABASE_URL : ${SAFE_URL}"
yellow ""
yellow "WARNING: this will RUN MIGRATIONS and a downgrade/upgrade"
yellow "roundtrip against the database above. It MUTATES that DB."
yellow "Use a fresh, disposable STAGING database only."
echo

CONFIRM_FLAG="${1:-}"
if [[ "${CONFIRM_FLAG}" != "--yes" && "${STAGING_CONFIRM:-0}" != "1" ]]; then
  if [[ -t 0 ]]; then
    read -r -p "Type 'yes' to proceed against ${SAFE_URL}: " ANS
    [[ "${ANS}" == "yes" ]] || fail "Aborted by user."
  else
    fail "Refusing to run non-interactively without --yes or STAGING_CONFIRM=1."
  fi
fi

cd "${BACKEND_DIR}"

# --- 1. upgrade head -------------------------------------------------------
bold ">> [1/4] alembic upgrade head"
alembic upgrade head
green "   upgrade head OK"
echo

# --- 2. assert key tables exist -------------------------------------------
# Uses SQLAlchemy (already a backend dependency) so we do not require psql.
bold ">> [2/4] asserting key tables exist"
EXPECTED_TABLES="users courses programs program_courses student_learning_outcomes ccn_standards top_codes colleges departments divisions notifications documents rag_documents workflow_history comments"

python - "$EXPECTED_TABLES" <<'PY'
import sys
from sqlalchemy import create_engine, inspect
from app.core.config import settings

expected = sys.argv[1].split()
engine = create_engine(settings.DATABASE_URL)
present = set(inspect(engine).get_table_names())

missing = [t for t in expected if t not in present]
for t in expected:
    mark = "ok " if t in present else "MISSING"
    print(f"   [{mark}] {t}")
if missing:
    print(f"\nFAIL: missing tables: {', '.join(missing)}", file=sys.stderr)
    sys.exit(1)
print(f"\n   all {len(expected)} expected tables present "
      f"({len(present)} total in schema)")
PY
green "   table assertions OK"
echo

# --- 3. record current head, downgrade one, re-upgrade --------------------
bold ">> [3/4] downgrade -1 then upgrade head (rollback rehearsal)"
BEFORE="$(alembic current 2>/dev/null | tr -d '\n')"
echo "   current revision : ${BEFORE:-<none>}"
alembic downgrade -1
AFTER_DOWN="$(alembic current 2>/dev/null | tr -d '\n')"
echo "   after downgrade  : ${AFTER_DOWN:-<base>}"
alembic upgrade head
green "   downgrade/upgrade roundtrip OK"
echo

# --- 4. re-assert tables after roundtrip ----------------------------------
bold ">> [4/4] re-asserting tables after roundtrip"
python - "$EXPECTED_TABLES" <<'PY'
import sys
from sqlalchemy import create_engine, inspect
from app.core.config import settings
expected = sys.argv[1].split()
engine = create_engine(settings.DATABASE_URL)
present = set(inspect(engine).get_table_names())
missing = [t for t in expected if t not in present]
if missing:
    print(f"FAIL: tables missing after roundtrip: {', '.join(missing)}", file=sys.stderr)
    sys.exit(1)
print("   all expected tables still present after roundtrip")
PY
green "   post-roundtrip assertions OK"
echo

bold "=========================================================="
green " MIGRATIONS: PASS"
bold "=========================================================="
