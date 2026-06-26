#!/usr/bin/env bash
#
# validate_staging.sh - Orchestrator for Calricula staging validation.
#
# Runs, in order:
#   1. Migrations  (validate_migrations.sh)   -- mutates DATABASE_URL
#   2. Auth        (validate_auth.py)          -- HTTP against API_BASE_URL
#   3. AI / RAG    (validate_ai.py)            -- live Gemini, INCURS COST
#
# Each step is independent: a failure is recorded but the remaining steps still
# run, so you get a full picture. A final summary table is printed and the
# script exits non-zero if ANY step failed.
#
# Required env (see docs/STAGING_VALIDATION.md):
#   DATABASE_URL        fresh staging DB (mutated by the migration step)
#   API_BASE_URL        staging API base URL
#   FIREBASE_ID_TOKEN   valid Firebase ID token for a staging user
#   GOOGLE_API_KEY      live Gemini key
#
# Skip flags (env): SKIP_MIGRATIONS=1  SKIP_AUTH=1  SKIP_AI=1
# AI flags (env):   AI_SKIP_RAG=1  -> basic generate only (cheaper)
#
# The migration step runs with --yes (non-interactive); only point this at a
# disposable STAGING database.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*"; }

PY="${PYTHON:-python3}"

MIG_RESULT="SKIPPED"
AUTH_RESULT="SKIPPED"
AI_RESULT="SKIPPED"

bold "##########################################################"
bold "#  Calricula staging validation                          #"
bold "##########################################################"
echo

# --- 1. migrations ---------------------------------------------------------
if [[ "${SKIP_MIGRATIONS:-0}" == "1" ]]; then
  echo ">>> [1/3] migrations: SKIPPED (SKIP_MIGRATIONS=1)"
else
  echo ">>> [1/3] migrations"
  if STAGING_CONFIRM=1 bash "${SCRIPT_DIR}/validate_migrations.sh" --yes; then
    MIG_RESULT="PASS"
  else
    MIG_RESULT="FAIL"
  fi
fi
echo

# --- 2. auth ---------------------------------------------------------------
if [[ "${SKIP_AUTH:-0}" == "1" ]]; then
  echo ">>> [2/3] auth: SKIPPED (SKIP_AUTH=1)"
else
  echo ">>> [2/3] auth"
  if "${PY}" "${SCRIPT_DIR}/validate_auth.py"; then
    AUTH_RESULT="PASS"
  else
    AUTH_RESULT="FAIL"
  fi
fi
echo

# --- 3. ai / rag -----------------------------------------------------------
if [[ "${SKIP_AI:-0}" == "1" ]]; then
  echo ">>> [3/3] ai/rag: SKIPPED (SKIP_AI=1)"
else
  echo ">>> [3/3] ai/rag"
  AI_ARGS=()
  [[ "${AI_SKIP_RAG:-0}" == "1" ]] && AI_ARGS+=("--skip-rag")
  if "${PY}" "${SCRIPT_DIR}/validate_ai.py" "${AI_ARGS[@]}"; then
    AI_RESULT="PASS"
  else
    AI_RESULT="FAIL"
  fi
fi
echo

# --- summary ---------------------------------------------------------------
bold "=========================================================="
bold " STAGING VALIDATION SUMMARY"
bold "=========================================================="
printf "  %-14s %s\n" "Migrations" "${MIG_RESULT}"
printf "  %-14s %s\n" "Auth"       "${AUTH_RESULT}"
printf "  %-14s %s\n" "AI / RAG"   "${AI_RESULT}"
bold "=========================================================="

if [[ "${MIG_RESULT}" == "FAIL" || "${AUTH_RESULT}" == "FAIL" || "${AI_RESULT}" == "FAIL" ]]; then
  red "RESULT: NO-GO (one or more checks failed)"
  exit 1
fi
green "RESULT: GO (all non-skipped checks passed)"
exit 0
