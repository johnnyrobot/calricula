### Task 5: Navigation item and program-page action

**Files:**
- Modify: `frontend/src/components/layout/PageShell.tsx` (imports at lines 11–35; `navigation` array lines 60–105; filter at 129–133)
- Modify: `frontend/src/app/programs/[id]/page.tsx` (action cluster lines 402–423)
- Test: `frontend/src/components/layout/__tests__/PageShell.applicationx.test.tsx`

**Interfaces:**
- `NavItem` gains `requiresApplicationX?: boolean`; the new entry is `{ name: 'Employer & Career Collaboration', href: '/collaboration', icon: BriefcaseIcon, iconActive: BriefcaseIconSolid, requiresApplicationX: true }` placed after `LMI Data` and before `BLS Data` (index 5 of the array).
- Filter: items with `requiresApplicationX` render only when `useApplicationXStatus().status?.enabled` is true (nav therefore hides entirely when the embed is disabled, satisfying EMBEDDED §6 "disabling removes the host entry").
- Program page: a `luminous-button-secondary` link `Collaboration` with `BriefcaseIcon` to `/programs/${program.id}/collaboration`, rendered for every status (not only Draft) when the status hook reports enabled; placed before the Export PDF button inside the `flex items-center gap-3` div at line 403.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import PageShell from '../PageShell';
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u', email: 'f@calricula.com', full_name: 'F', role: 'Faculty' }, loading: false, isAuthenticated: true, logout: jest.fn(), getToken: async () => 't' }) }));
const status = jest.fn();
jest.mock('@/hooks/useApplicationXStatus', () => ({ useApplicationXStatus: () => status() }));
jest.mock('@/components/notifications/NotificationBell', () => () => null);

test('nav shows collaboration only when embed enabled', () => {
  status.mockReturnValue({ status: { enabled: true }, loading: false });
  render(<PageShell><div>x</div></PageShell>);
  expect(screen.getAllByRole('link', { name: /Employer & Career Collaboration/ })[0]).toHaveAttribute('href', '/collaboration');
});
test('nav hides collaboration when disabled or unknown', () => {
  status.mockReturnValue({ status: { enabled: false }, loading: false });
  render(<PageShell><div>x</div></PageShell>);
  expect(screen.queryByRole('link', { name: /Employer & Career Collaboration/ })).toBeNull();
});
```
(Adjust the `NotificationBell` mock path to the actual import in `PageShell.tsx` lines 11–40.)

- [ ] **Step 2: Run** → fails (link absent)

- [ ] **Step 3: Implement** the `NavItem` field, the entry, both heroicons imports (`BriefcaseIcon` outline at lines 11–24; `BriefcaseIcon as BriefcaseIconSolid` in the solid block at lines 27–35), the filter clause `if (item.requiresApplicationX && !axStatus?.enabled) return false;` (call `useApplicationXStatus()` near line 128), and the program-page button:
```tsx
{axStatus?.enabled && (
  <Link href={`/programs/${program.id}/collaboration`} className="luminous-button-secondary inline-flex items-center">
    <BriefcaseIcon className="h-5 w-5 mr-2" aria-hidden="true" />
    Collaboration
  </Link>
)}
```

- [ ] **Step 4: Run** `npm test` → passes; `npm run build` → clean

- [ ] **Step 5: Commit** — `feat(frontend): Employer & Career Collaboration nav item and program action, gated by embed status`.

---

