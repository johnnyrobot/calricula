### Task 5: Broker audience for the embedded workspace (host-plan hook)

**Files:** `frontend/src/lib/logto.ts` (`resources: [LOGTO_API_RESOURCE, LOGTO_APPLICATIONX_RESOURCE]`), `frontend/src/app/api/auth/token/route.ts` (accepts `?resource=` limited to the two configured indicators and returns a token for that resource), the host plan's `createBrokeredAdapter` (Task 7 there) reads `getToken('applicationx')`; backend broker (host plan Task 2) forwards that token unchanged and ApplicationX verifies `aud == OIDC_AUDIENCE` of the ApplicationX API.
- [ ] Test: the token route refuses unknown resources (400) and never returns a token for the ApplicationX resource to a signed-out session.
- [ ] Commit `feat(auth): per-resource access tokens for the ApplicationX broker`.

