# Task 4 Report: Model Gateway Implementation

## Summary

Implemented provider-independent model gateway with deterministic FakeGateway for testing and GeminiGateway for production use via Gemini 2.5 Flash. All 3 required tests pass; full suite (326 tests) passes with 93% coverage (exceeds 70% floor).

## Implementation Details

### Files Created

1. **`backend/app/chat/__init__.py`** — Empty package init
2. **`backend/app/chat/model_gateway.py`** — Gateway implementation with:
   - `Grounding` model: evidence list, scope dict, question, language (en/es)
   - `Draft` model: answer, cited_ids, unknowns list
   - `ModelGateway` protocol: `draft(g: Grounding) -> Draft`
   - `build_system_instruction(language: str) -> str`: System prompt forbidding invention, requiring evidence_id citations, preserving exact course codes/class numbers
   - `FakeGateway`: Deterministic; returns evidence summaries joined as answer, all evidence_ids as citations; supports optional script injection for tests
   - `GeminiGateway`: Lazy `google.genai` import in `__init__` and `draft` methods; JSON response schema, temperature 0
   - `get_gateway() -> ModelGateway`: Returns GeminiGateway if `MODEL_PROVIDER=="gemini"` and `GOOGLE_API_KEY` is set; otherwise FakeGateway

### Files Modified

1. **`backend/app/core/config.py`**
   - Added `from typing import Literal` import
   - Added three config fields:
     - `GOOGLE_API_KEY: str | None = None`
     - `GEMINI_MODEL: str = "gemini-2.5-flash"`
     - `MODEL_PROVIDER: Literal["gemini", "fake"] = "fake"`

2. **`.env.example`**
   - Added config variable placeholders:
     - `GOOGLE_API_KEY=` (empty)
     - `GEMINI_MODEL=gemini-2.5-flash`
     - `MODEL_PROVIDER=fake`

3. **`backend/requirements.txt`**
   - Added `google-genai>=1.0.0`

### Test File Created

**`backend/tests/test_model_gateway.py`** — Three tests matching brief specification:

1. **`test_fake_cites_only_provided_ids`**: Validates FakeGateway cites exact evidence_ids and includes summaries in answer
2. **`test_default_provider_is_fake_without_key`**: Verifies fallback to FakeGateway when MODEL_PROVIDER="gemini" but GOOGLE_API_KEY is None
3. **`test_gemini_prompt_contains_no_secrets_or_hidden_reasoning`**: Confirms system instruction includes "evidence_id" and "invent", but no "api key"

## Dependency Resolution

- Installed **google-genai>=1.0.0** → resolved to **2.24.0**
- No other new dependencies added
- firebase-admin 7.6.0 already present (from Task 2)

## Test Results

### Targeted Test (task_model_gateway.py)
```
tests/test_model_gateway.py ...                                          [100%]
3 passed in 0.01s
```

### Full Test Suite
```
326 passed in 4.48s
Required test coverage of 70% reached. Total coverage: 93.07%
```

Coverage breakdown for model_gateway.py: 79% (8 missed lines)
- Tested: Grounding/Draft models, build_system_instruction, FakeGateway default behavior, get_gateway fallback
- Missed: GeminiGateway implementation (requires real API key; testing deferred to integration/e2e)

## TDD Verification

**RED phase:** Written failing test first → `ModuleNotFoundError: No module named 'app.chat'`

**GREEN phase:** Implemented exact code from brief → all 3 tests passed

**Refactor phase:** No refactoring needed; code is minimal and matches brief exactly

## Code Quality Checklist

- [x] No logging of prompts or API keys
- [x] No personal email addresses committed
- [x] No secrets in `.env.example` (GOOGLE_API_KEY is empty placeholder)
- [x] Lazy imports in GeminiGateway (google.genai imported only on gateway instantiation)
- [x] Deterministic FakeGateway suitable for unit tests
- [x] Config-driven provider selection with safe fallback
- [x] Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
- [x] Coverage floor maintained (93% vs. 70% requirement)
- [x] All assertions use real evidence/behavior (no mock magic)

## Commits (Initial)

```
Commit: 5d6fe77 (replaced)
Message: feat(chat): provider-independent model gateway with Gemini adapter and deterministic fake
Files: 6 changed, 122 insertions(+)
Status: TRAILER FIXED (see Fix Round 1 below)
```

## Self-Review Findings

No issues found. Implementation adheres exactly to brief specification:
- All interfaces and methods match contract
- Test assertions are precise and deterministic
- Configuration defaults safely (fake provider)
- No test dependencies on network or credentials
- No console/log noise

---

## Fix Round 1: Trailer Format & Error Handling

**Findings fixed:**
1. Commit trailer lacked blank line before `Co-Authored-By`, preventing git trailer parsing
2. GeminiGateway.draft raised untyped exceptions; needed typed ModelError for provider failures

### Trailer Format Fix

**Issue:** Original commit 5d6fe77's message ended with:
```
...resolves to 2.24.0.
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

No blank line = git does not parse trailer. Verified with:
```bash
git log -1 5d6fe77 --format='%(trailers:key=Co-Authored-By,valueonly)'
# (empty output)
```

**Resolution:** Reset to parent commit 4a53b44, re-committed both fixes with blank-line-separated trailers.

### Error Handling Implementation

**Files modified:**
- `backend/app/chat/model_gateway.py`:
  - Added `ModelError(Exception)` class
  - Updated `ModelGateway` protocol docstring to document ModelError
  - Wrapped `GeminiGateway.draft` in try/except to catch SDK exceptions, JSON validation errors, and None responses
  - Re-raises as `ModelError` with exception chaining

- `backend/tests/test_model_gateway.py`:
  - Added `test_gemini_gateway_raises_model_error_on_none_response`: Stubs client to return `resp.text=None`
  - Added `test_gemini_gateway_raises_model_error_on_invalid_json`: Stubs client to return invalid JSON
  - Added `test_gemini_gateway_successful_response_with_request_validation`: Verifies successful path, validates request shape (model name, temperature=0, JSON with question/scope/evidence)

### Test Results (Post-Fix)

```bash
$ cd backend && .venv/bin/python -m pytest tests/test_model_gateway.py -q --no-cov
......                                                                   [100%]
6 passed in 0.02s
```

Full suite:
```bash
$ cd backend && .venv/bin/python -m pytest --tb=line
...
TOTAL                                         1020     67    93%
Required test coverage of 70% reached. Total coverage: 93.43%
329 passed in 5.16s
```

### Final Commits

```
Commit: 241641d (replacement for 5d6fe77)
Message: feat(chat): provider-independent model gateway with Gemini adapter and deterministic fake
Trailer verification:
$ git log -1 241641d --format='%(trailers:key=Co-Authored-By,valueonly)'
Claude Fable 5.1 <noreply@anthropic.com>
✓ PARSED

Commit: c16a60b
Message: fix(chat): typed ModelError for provider failures and malformed drafts
Trailer verification:
$ git log -1 c16a60b --format='%(trailers:key=Co-Authored-By,valueonly)'
Claude Fable 5.1 <noreply@anthropic.com>
✓ PARSED
```

### Coverage

- `model_gateway.py`: 90% (5 missed lines: google.genai imports in GeminiGateway.__init__ and draft)
- Full suite: 93.43% (exceeds 70% floor)
- All error handling paths covered without network access

### Concerns

None. Both trailers now correctly parsed; error handling complete; all 329 tests pass.
