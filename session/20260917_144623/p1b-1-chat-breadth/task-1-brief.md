### Task 1: Institution and year slots; Spanish campus aliases

**Files:**
- Modify: `backend/app/chat/slots.py`
- Modify: `backend/app/api/chat.py:20` (`SCOPE_KEYS`)
- Modify: `backend/app/chat/intents.py:10` (transfer keywords)
- Test: `backend/tests/test_slots_p1b.py`

**Interfaces:**
- Consumes: existing `ResolvedScope(campus, term, catalog_year)`, `Clarification(slot, choices, prompt)`, `resolve_slots(text, prior, defaults, intent, explicit)`.
- Produces: `ResolvedScope` gains `institution: str | None = None`, `year: str | None = None`; `Clarification.slot: Literal["campus","term","institution","year"]`; `INSTITUTIONS: dict[str, list[str]]` (canonical ASSIST-resolvable name → aliases); `detect_institution(text) -> list[str]`; `detect_years(text) -> list[str]`; `TRANSFER_INTENTS = {"transfer"}`. Later tasks read `scope.institution` and `scope.year`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_slots_p1b.py`:
```python
import pytest
from app.chat.slots import (INSTITUTIONS, ResolvedScope, detect_campuses, detect_institution, detect_years, resolve_slots)


def _scope(**kw):
    return ResolvedScope(**kw)


@pytest.mark.parametrize("text,code", [
    ("horario en Misión", "LAMC"), ("clases en el Este", "ELAC"), ("Los Angeles Valley College", "LAVC"),
    ("west la college", "WLAC"), ("trade tech", "LATTC"), ("Harbor College", "LAHC"), ("Pierce", "LAPC"),
    ("southwest college", "LASC"), ("LA City College", "LACC"),
])
def test_campus_aliases_english_and_spanish(text, code):
    assert detect_campuses(text) == [code]


def test_detect_institution_by_alias_and_canonical():
    assert detect_institution("Does MATH 261 transfer to UCLA?") == ["University of California, Los Angeles"]
    assert detect_institution("transfer to Cal State Northridge in 2026") == ["California State University, Northridge"]
    assert detect_institution("what transfers?") == []


def test_detect_years_dedupes_in_order():
    assert detect_years("agreements for 2025-2026 and 2024") == ["2025", "2026", "2024"]


def test_transfer_without_institution_asks_for_one():
    scope, clar = resolve_slots("does math 261 transfer?", _scope(campus="LAMC"), _scope(), "transfer")
    assert clar is not None and clar.slot == "institution" and clar.choices == list(INSTITUTIONS)
    assert scope.campus == "LAMC" and scope.institution is None


def test_transfer_with_institution_and_default_year_does_not_ask():
    scope, clar = resolve_slots("does math 261 transfer to UCLA?", _scope(campus="LAMC"), _scope(year="2025"), "transfer")
    assert clar is None and scope.institution == "University of California, Los Angeles" and scope.year == "2025"


def test_two_years_in_text_ask_which_year():
    scope, clar = resolve_slots("UCLA agreements for 2024 or 2025?", _scope(campus="LAMC"), _scope(year="2025"), "transfer")
    assert clar is not None and clar.slot == "year" and clar.choices == ["2024", "2025"]


def test_explicit_institution_and_year_win_and_are_never_reasked():
    explicit = _scope(institution="California State University, Northridge", year="2024")
    scope, clar = resolve_slots("UCLA agreements for 2024 or 2025?", _scope(campus="LAMC"), _scope(), "transfer", explicit)
    assert clar is None and scope.institution == explicit.institution and scope.year == "2024"


def test_non_transfer_intents_ignore_institution():
    scope, clar = resolve_slots("open seats in math 261 fall 2026", _scope(campus="LAMC"), _scope(), "schedule")
    assert clar is None and scope.institution is None


@pytest.mark.parametrize("q", ["does math 261 transfer?", "LAMC articulation agreements with UCLA", "is this course transferable to CSUN"])
def test_bare_transfer_words_route_to_transfer(q):
    from app.chat.intents import classify_intent
    assert classify_intent(q, "en")[0] == "transfer"


def test_scope_keys_accept_institution_and_year():
    from app.api.chat import SCOPE_KEYS
    assert set(SCOPE_KEYS) == {"campus", "term", "institution", "year"}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_slots_p1b.py -q --no-cov`
Expected: FAIL — `ImportError: cannot import name 'detect_institution'`

- [ ] **Step 3: Implement**

`backend/app/chat/slots.py` — replace the module body with:
```python
import re
from typing import Literal

from pydantic import BaseModel

# Canonical campus code -> lowercase aliases matched as whole words (English and Spanish).
CAMPUSES = {
    "LACC": ["city college", "lacc", "la city college", "los angeles city college", "colegio de la ciudad"],
    "ELAC": ["east", "elac", "east los angeles college", "este"],
    "LAHC": ["harbor", "lahc", "harbor college", "los angeles harbor college", "puerto"],
    "LAMC": ["mission", "lamc", "mission college", "los angeles mission college", "misión", "mision"],
    "LAPC": ["pierce", "lapc", "pierce college", "los angeles pierce college"],
    "LASC": ["southwest", "lasc", "southwest college", "los angeles southwest college", "suroeste"],
    "LATTC": ["trade", "lattc", "trade tech", "trade-tech", "trade-technical", "los angeles trade-technical college", "trade technical"],
    "LAVC": ["valley", "lavc", "valley college", "los angeles valley college", "valle"],
    "WLAC": ["west", "wlac", "west la", "west la college", "west los angeles college", "oeste"],
}
# Receiving institutions ASSIST can resolve by name (articulation.resolve `name` pattern [\w .,'&-]{2,80}) -> aliases.
INSTITUTIONS = {
    "University of California, Los Angeles": ["ucla", "uc los angeles"],
    "University of California, Berkeley": ["uc berkeley", "berkeley", "cal"],
    "University of California, Irvine": ["uc irvine", "uci"],
    "University of California, San Diego": ["uc san diego", "ucsd"],
    "University of California, Santa Barbara": ["uc santa barbara", "ucsb"],
    "California State University, Northridge": ["csun", "cal state northridge", "northridge"],
    "California State University, Los Angeles": ["csula", "cal state la", "cal state los angeles"],
    "California State University, Long Beach": ["csulb", "cal state long beach", "long beach state"],
    "California State University, Dominguez Hills": ["csudh", "dominguez hills"],
    "California State Polytechnic University, Pomona": ["cal poly pomona", "cpp"],
    "San Diego State University": ["sdsu", "san diego state"],
}
_SEASONS = {"fall": "8", "otoño": "8", "otono": "8", "spring": "3", "primavera": "3", "summer": "5", "verano": "5", "winter": "1", "invierno": "1"}
_TERM_RE = re.compile(r"\b(fall|otoño|otono|spring|primavera|summer|verano|winter|invierno)\s+(20\d{2})\b", re.I)
_YEAR_RE = re.compile(r"\b(20\d{2})\b")
TERM_INTENTS = {"schedule", "sequence"}
TRANSFER_INTENTS = {"transfer"}


class ResolvedScope(BaseModel):
    campus: str | None = None
    term: str | None = None
    catalog_year: str | None = None
    institution: str | None = None
    year: str | None = None


class Clarification(BaseModel):
    slot: Literal["campus", "term", "institution", "year"]
    choices: list[str]
    prompt: str


def _matches(text: str, names: list[str]) -> bool:
    return any(re.search(rf"(?<![\w-]){re.escape(n)}(?![\w-])", text) for n in names)


def detect_campuses(text: str) -> list[str]:
    t = text.lower()
    return [code for code, names in CAMPUSES.items() if _matches(t, names)]


def detect_institution(text: str) -> list[str]:
    t = text.lower()
    return [name for name, aliases in INSTITUTIONS.items() if _matches(t, [name.lower(), *aliases])]


def detect_term(text: str) -> str | None:
    m = _TERM_RE.search(text)
    return f"2{m.group(2)[2:]}{_SEASONS[m.group(1).lower()]}" if m else None


def detect_years(text: str) -> list[str]:
    out: list[str] = []
    for y in _YEAR_RE.findall(text):
        if y not in out:
            out.append(y)
    return out


def resolve_slots(text: str, prior: ResolvedScope, defaults: ResolvedScope, intent: str,
                  explicit: ResolvedScope | None = None) -> tuple[ResolvedScope, Clarification | None]:
    """Resolve campus, term and (for transfer questions) institution and year for one turn.

    `explicit` carries the slot values the user chose this turn (clarification
    chips resend the question with them): an explicit value wins outright and is
    never re-asked, whatever the resent text mentions. Without one, a campus
    named in the text is adopted when there is no prior; a text that names the
    prior campus keeps it silently; a single *different* campus asks "switch or
    keep"; several campuses, none of them the prior, ask which. Transfer
    questions additionally need a receiving institution (asked when the text
    names none) and an agreement year (the text's year, else the prior, else
    the default; two different years in the text ask which).
    """
    explicit = explicit or ResolvedScope()
    found = detect_campuses(text)
    catalog_year = prior.catalog_year or defaults.catalog_year
    inst, year = _transfer_slots(text, prior, defaults, intent, explicit)
    if explicit.campus:
        campus = explicit.campus
    elif prior.campus and prior.campus in found:
        campus = prior.campus  # the user named the campus they are already in
    elif len(found) == 1 and not prior.campus:
        campus = found[0]
    elif len(found) == 1 and prior.campus:
        return ResolvedScope(campus=prior.campus, term=explicit.term or detect_term(text) or prior.term or defaults.term,
                             catalog_year=catalog_year, institution=inst, year=year), Clarification(
            slot="campus", choices=[found[0], prior.campus], prompt=f"Switch to {found[0]} or keep {prior.campus}?"
        )
    elif len(found) > 1:
        return ResolvedScope(campus=prior.campus, term=explicit.term or prior.term or detect_term(text),
                             institution=inst, year=year), Clarification(
            slot="campus", choices=found, prompt="Which campus do you mean?"
        )
    else:
        campus = prior.campus or defaults.campus
    term = explicit.term or detect_term(text) or prior.term or defaults.term
    scope = ResolvedScope(campus=campus, term=term, catalog_year=catalog_year, institution=inst, year=year)
    if campus is None and intent != "out_of_scope":
        return scope, Clarification(slot="campus", choices=list(CAMPUSES), prompt="Which LACCD campus?")
    if term is None and intent in TERM_INTENTS:
        return scope, Clarification(slot="term", choices=[], prompt="Which term (for example, Fall 2026)?")
    if intent in TRANSFER_INTENTS:
        if inst is None:
            return scope, Clarification(slot="institution", choices=list(INSTITUTIONS), prompt="Which college or university do you want to transfer to?")
        if year is None:
            years = detect_years(text)
            return scope, Clarification(slot="year", choices=years, prompt="Which academic year's agreements?")
    return scope, None


def _transfer_slots(text: str, prior: ResolvedScope, defaults: ResolvedScope, intent: str,
                    explicit: ResolvedScope) -> tuple[str | None, str | None]:
    """(institution, year) for transfer questions; (None, None) for every other intent."""
    if intent not in TRANSFER_INTENTS:
        return None, None
    found = detect_institution(text)
    inst = explicit.institution or (found[0] if len(found) == 1 else None) or prior.institution
    years = detect_years(text)
    if explicit.year:
        year = explicit.year
    elif len(years) > 1:
        year = None  # ambiguous: the caller asks which
    else:
        year = (years[0] if years else None) or prior.year or defaults.year
    return inst, year
```

`backend/app/api/chat.py` line 20: `SCOPE_KEYS = ("campus", "term", "institution", "year")`.

`backend/app/chat/intents.py` line 10 — the transfer row becomes:
```python
    ("transfer", ["transfer to", "transfer", "transferable", "articulat", "agreement", "assist", "csu", " uc ", "ucla", "igetc",
                  "transferir", "transferencia", "convenio"]),
```
(it sits before `sequence`/`pathway`/`schedule`, so "transfer" wins over "program map" only when both appear — acceptable; `test_intents.py` must stay green.)

- [ ] **Step 4: Run the slot tests and the existing suites that touch slots**

Run: `cd backend && python -m pytest tests/test_slots_p1b.py tests/test_chat_pipeline.py tests/test_chat_api.py tests/test_intents.py -q --no-cov`
Expected: all pass. (`test_two_years_in_text_ask_which_year` passes because the explicit-free path leaves `year=None` when the text names two years; the default year is only used when the text names none.)

- [ ] **Step 5: Commit**

```bash
git add backend/app/chat/slots.py backend/app/api/chat.py backend/tests/test_slots_p1b.py
git commit -m "feat(chat): institution and year slots for transfer questions; Spanish campus aliases

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

