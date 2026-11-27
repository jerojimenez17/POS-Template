# Auth.js session route test checklist

## Automated acceptance coverage

- [ ] **AC-01 — Canonical route:** `auth-session-route.test.ts` verifies that `src/app/api/auth/[...nextauth]/route.ts` exists at the canonical catch-all location.
- [ ] **AC-02 — Correct wiring:** the static test requires `import { handlers } from "@/auth"` and direct `export const { GET, POST } = handlers`; it rejects custom response wrapping.
- [ ] **AC-02 — No duplicate endpoint:** the static test fails if another `session` page or route is added under `src/app/api/auth`.
- [ ] **AC-03/AC-04 — Unauthenticated endpoint:** the deterministic handler contract test requires status `200`, an `application/json` content type, and JSON body `null` without cookies.
- [ ] **AC-05 — Authenticated endpoint:** the deterministic contract test preserves `user.id`, `role`, business metadata, and image fields when a session cookie is present.
- [ ] **AC-06 — HTML regression:** the response must not begin with `<!DOCTYPE`; its body must be valid JSON, preventing `Unexpected token '<'` / `ClientFetchError` behavior.
- [ ] **AC-07 — Auth flow wiring:** direct `POST` export is statically required, preserving Auth.js callback, sign-in, and sign-out operations through the same catch-all handler.

## Manual/integration verification after implementation

- [ ] **AC-03:** run a clean Next.js dev or production build, inspect the route manifest, and request `GET /api/auth/session`; it must not resolve to the app HTML 404 page.
- [ ] **AC-04:** with no session cookie, verify `200`, JSON content type, and body `null` using the real Auth.js handler and non-secret test configuration.
- [ ] **AC-05:** establish a valid test session through the supported credentials flow and verify the callback-populated user, role, business fields, and image.
- [ ] **AC-07:** exercise credential/OAuth callback and logout endpoints; expected behavior is Auth.js's normal response/redirect/error-page behavior, never an HTML 404.
- [ ] **AC-08:** invoke an existing authenticated server action/component and confirm `auth()` still supplies the same authorization context.
- [ ] **AC-09:** review `auth.ts`, `auth.config.ts`, `src/lib/auth.ts`, adapter, JWT strategy, providers, callbacks, pages, and environment contract for no unrelated changes.
- [ ] **AC-10:** run strict TypeScript, ESLint, production build, and the full Vitest suite.

## Negative and edge cases

- [ ] A missing or invalid cookie is treated as unauthenticated (`200` JSON `null`), not as an HTML error.
- [ ] A valid existing cookie does not require a new login and retains all callback fields, including nullable business/image values.
- [ ] Session JSON remains parseable when the endpoint is called directly with `/api/auth/session` and with unrelated Auth.js catch-all paths.
- [ ] No hand-written `/api/auth/session` route, rewrite, fallback, middleware substitute, or custom JSON serializer is introduced.
- [ ] Auth.js/provider or database/configuration failures are handled by Auth.js's standard route behavior; raw Prisma/configuration errors must not become a successful HTML response.
- [ ] No secrets, credentials, environment values, Prisma migrations, dependency upgrades, or unrelated source changes are added.

## Expected failure evidence (RED phase)

- The static wiring test currently fails because the route imports a deep relative `auth` path instead of `@/auth`.
- The mocked runtime tests currently fail to prove delegation because the route does not import the mocked `@/auth` module; after the wiring fix they should return deterministic Auth.js-shaped JSON and pass.
- The duplicate-route and checklist assertions should remain passing unless an implementation introduces an unintended competing endpoint.
