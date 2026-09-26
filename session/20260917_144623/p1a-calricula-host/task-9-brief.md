### Task 9: E2E with a stub upstream, environment docs and exit checklist

**Files:**
- Create: `backend/tests/stubs/applicationx_stub.py`, `frontend/e2e/applicationx-embed.spec.ts`, `docs/applicationx/plans/P1A-HOST-EXIT.md`
- Modify: `.env.example` (after line 114), `README.md` (short section), `docs/applicationx/README.md` (note that host integration exists behind a flag)

**Interfaces:**
- `applicationx_stub.py`: FastAPI app on `:8099` implementing `/v1/host-contexts/resolve` (returns `ready` for `program_ref.external_id` in the `STUB_MAPPED` env list, `mapping_required` otherwise, `access_required` when the bearer is `dev-articulation-001`, 503 when `STUB_DOWN=1`; in dev mode the forwarded bearer is a `dev-*` token, in production it is the Logto access token Calricula obtains via `getToken('applicationx')` — audience `LOGTO_APPLICATIONX_RESOURCE`, ADR-0001), `/v1/chat/messages` (202 with a run id), `/v1/chat/runs/{id}/events` (three events: status, answer with one citation, done; honors `Last-Event-ID`), `/v1/chat/runs/{id}/cancel`, `/v1/sources`. Run with `uvicorn tests.stubs.applicationx_stub:app --port 8099`.
- `.env.example` additions:
```
# ApplicationX embedded staff workspace (optional companion app)
APPLICATIONX_EMBED_ENABLED=false
APPLICATIONX_API_ORIGIN=http://localhost:8002
APPLICATIONX_ORGANIZATION_REF=lamc
APPLICATIONX_CAMPUS_REF=LAMC
APPLICATIONX_STANDALONE_URL=http://localhost:3002
# APPLICATIONX_SERVICE_TOKEN=
```

- [ ] **Step 1: Write the e2e (EMBEDDED §7 cases 1, 4, 6, 8, 9)**

```ts
import { expect, test } from '@playwright/test';
import { TEST_USERS, loginAsUser } from './fixtures/ccn-fixtures';

test.describe('ApplicationX embed', () => {
  test('staff enters from nav and program page and chats without leaving the layout (case 1)', async ({ page }) => {
    await loginAsUser(page, TEST_USERS.faculty);
    await page.getByRole('link', { name: /Employer & Career Collaboration/ }).first().click();
    await expect(page).toHaveURL(/\/collaboration$/);
    await page.goto('/programs');
    await page.getByRole('link', { name: /Nursing/ }).first().click();
    await page.getByRole('link', { name: /^Collaboration$/ }).click();
    await expect(page.getByRole('navigation')).toBeVisible();
    await expect(page.getByRole('region', { name: /Workspace context/ })).toContainText('LAMC');
    await page.getByLabel(/ask/i).fill('open seats in MULTIMD 100');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toHaveText(/answer ready/i);
    await expect(page.getByRole('list', { name: /sources/i })).toBeVisible();
  });
  test('unmapped program requires explicit setup (case 4)', async ({ page }) => {
    await loginAsUser(page, TEST_USERS.faculty);
    await page.goto('/programs'); await page.getByRole('link', { name: /Certificate/ }).first().click();
    await page.getByRole('link', { name: /^Collaboration$/ }).click();
    await expect(page.getByText(/not mapped to an ApplicationX workspace/)).toBeVisible();
    await expect(page.getByLabel(/ask/i)).toHaveCount(0);
  });
  test('reload and back preserve program context (case 6)', async ({ page }) => {
    await loginAsUser(page, TEST_USERS.faculty);
    await page.goto('/programs'); await page.getByRole('link', { name: /Nursing/ }).first().click();
    const programUrl = page.url();
    await page.getByRole('link', { name: /^Collaboration$/ }).click();
    await page.reload();
    await expect(page.getByRole('region', { name: /Workspace context/ })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(programUrl);
  });
  test('keyboard-only chat at narrow width (case 8)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await loginAsUser(page, TEST_USERS.faculty);
    await page.goto('/programs'); await page.getByRole('link', { name: /Nursing/ }).first().click();
    await page.getByRole('link', { name: /^Collaboration$/ }).click();
    await page.keyboard.press('Tab'); // skip link
    for (let i = 0; i < 12; i++) { if (await page.getByLabel(/ask/i).evaluate((el) => el === document.activeElement)) break; await page.keyboard.press('Tab'); }
    await page.keyboard.type('library hours'); await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toHaveText(/answer ready/i);
  });
  test('upstream outage leaves curriculum editing usable (case 9)', async ({ page }) => {
    test.skip(!process.env.STUB_DOWN, 'run with STUB_DOWN=1 against the stub');
    await loginAsUser(page, TEST_USERS.faculty);
    await page.goto('/programs'); await page.getByRole('link', { name: /Nursing/ }).first().click();
    await page.getByRole('link', { name: /^Collaboration$/ }).click();
    await expect(page.getByRole('alert')).toContainText(/unavailable/i);
    await page.getByRole('link', { name: /Back to program/ }).click();
    await expect(page.getByRole('link', { name: /Edit Program|Export PDF/ }).first()).toBeVisible();
  });
});
```

- [ ] **Step 2: Run** with the stack: backend (`AUTH_DEV_MODE=true APPLICATIONX_EMBED_ENABLED=true APPLICATIONX_API_ORIGIN=http://localhost:8099 APPLICATIONX_ORGANIZATION_REF=lamc APPLICATIONX_CAMPUS_REF=LAMC`), stub (`STUB_MAPPED=<Nursing program uuid from seeds>`), frontend dev; `npx playwright test e2e/applicationx-embed.spec.ts` → 4 passed, 1 skipped; rerun with `STUB_DOWN=1` → case 9 passes.

- [ ] **Step 3: Write `P1A-HOST-EXIT.md`** mapping EMBEDDED §7 cases to evidence: 1, 4, 6, 8, 9 → this spec; 2, 3, 5, 7, 10 → `applicationx/backend/tests/test_isolation.py` and `test_chat_api.py`; plus: `npm run build` clean, `npm test` coverage gate intact, `pytest` ≥ 45%, axe checks in `HostStatePanel.a11y.test.tsx`, keyboard/narrow-width case 8.

- [ ] **Step 4: Update docs** (`.env.example`, `README.md` "ApplicationX companion (optional)" section pointing at `docs/applicationx/`, package README note).

- [ ] **Step 5: Commit** — `test(e2e): ApplicationX embed acceptance cases with a stub upstream; document env`.

## Requirement traceability (Calricula host)

| Requirement / acceptance | Tasks |
| --- | --- |
| AX-21 in-layout route, global and program navigation | 5, 6 |
| AX-21 coordinated sign-in without a second login | 3 (token forwarded), 7 |
| AX-21 explicit program context, no browser-supplied program metadata | 3, 6 |
| AX-21 independent authorization (Calricula login ≠ access) | 2, 3 (no role gate; upstream decides) |
| AX-21 failure states and outage isolation | 4, 6, 9 |
| EMBEDDED §4 allowlisted operations, no cookies/headers, redaction | 2, 3 |
| EMBEDDED §5 context switch aborts and rejects late results; sign-out clears | 6, 7 |
| EMBEDDED §6 no duplicate main landmark, luminous light-only, gold-ink | 6, 8 |
| EMBEDDED §6 embed flag removes host entry | 1, 5 |
| Draft review R1 (no editor navigation), R2 (revision = updated_at), R3 (FastAPI broker), R11, R12 | 6, 3, 2, 1–3 tests, 8 |

Left out of P1a on purpose: a workspace selector listing (needs the P2 workspaces API), the unsaved-changes guard (not in AX-21 scope), Calipar embedding (excluded by the PRD).
