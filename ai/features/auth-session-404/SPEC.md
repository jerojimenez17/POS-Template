# Auth.js session endpoint 404

## Status and scope

- **Status:** architecture specification only. Production source changes and tests are intentionally out of scope for this step.
- **Goal:** restore the Auth.js v5 App Router endpoint at `/api/auth/session` so Auth.js client requests receive an Auth.js JSON response instead of the Next.js HTML 404 document.
- **In scope:** the App Router Auth.js catch-all route wiring, its import path, route registration verification, and regression coverage for the existing authentication behavior.
- **Out of scope:** provider changes, credential validation changes, session/JWT callback changes, Prisma schema/migrations, middleware policy, UI changes, dependency upgrades, and unrelated API routes.

## Observed behavior and repository diagnosis

The browser requests `GET /api/auth/session`, receives HTTP 404 and an HTML document beginning with `<!DOCTYPE`, and `ClientFetchError` then fails while parsing that document as JSON. The home page and a server action succeeding demonstrate that the application is running; they do not prove that the Auth.js route is registered.

The repository already has the Auth.js v5 configuration in the root `auth.ts` and a catch-all App Router route at `src/app/api/auth/[...nextauth]/route.ts`. The route must be the direct App Router adapter for the object returned by `NextAuth(...)`: it must export `GET` and `POST` from `handlers`. The implementation phase must normalize that route to the project alias (`@/auth`) rather than relying on a deep relative traversal, then verify the route in the generated Next.js route manifest/runtime. The alias is already defined in `tsconfig.json` and points to the root `auth.ts` module.

The canonical route is therefore:

```text
src/app/api/auth/[...nextauth]/route.ts
  -> import { handlers } from "@/auth"
  -> export const { GET, POST } = handlers
```

No separate `/api/auth/session` route should be created. Auth.js derives `session` (and the other Auth.js endpoints) from the catch-all handler. A 404 is a route-registration/wiring defect, not a session serialization defect; the HTML parse error is a consequence of the 404.

## Architectural decision

Keep the existing root `auth.ts` as the single Auth.js configuration and source of `handlers`, `auth`, `signIn`, and `signOut`. Keep the existing Prisma adapter, JWT strategy, providers, pages, events, and callbacks unchanged. Make the App Router route import that module through `@/auth` and export exactly the handler methods required by Auth.js.

The route must remain a Route Handler under `src/app/api/auth/[...nextauth]/route.ts`; it must not be moved to `pages/api`, replaced with a custom JSON endpoint, or implemented by calling `auth()` manually. The `GET` handler must handle `/api/auth/session`, and `POST` must preserve login/sign-out/callback operations already supported by Auth.js.

## Requirements

### R1. Route location and exports

1. The only Auth.js App Router route for this feature is `src/app/api/auth/[...nextauth]/route.ts`.
2. It imports `handlers` from `@/auth` and exports the `GET` and `POST` members from that object without wrapping, rewriting, or JSON-stringifying the response.
3. The route remains compatible with Next.js App Router route-handler discovery and the installed `next-auth` v5 beta package.
4. No duplicate `/api/auth/session` page, route, rewrite, or fallback is added.

### R2. Existing Auth.js behavior

1. `auth.ts` continues to use the existing `PrismaAdapter(db)` and `session: { strategy: "jwt" }`.
2. Existing credentials, Google, Facebook, and GitHub provider configuration remains unchanged.
3. Existing sign-in/error pages, `linkAccount`, `signIn`, `jwt`, and `session` callbacks remain unchanged in behavior, including `id`, `role`, `businessId`, business metadata, and image fields.
4. Server-side consumers importing `auth` from `@/auth` or `@/lib/auth` continue to work.
5. No credentials, secrets, or environment values are added to source code.

### R3. Runtime and response contract

1. `GET /api/auth/session` is routed to Auth.js and returns an Auth.js JSON response, never the Next.js HTML 404 page.
2. Without a valid session cookie, the endpoint returns the normal Auth.js unauthenticated response (`200` with JSON `null`, subject to the installed Auth.js version's standard response headers).
3. With a valid existing session cookie, the endpoint returns `200` JSON containing the existing session user fields supplied by the callbacks; it must not require a new login.
4. The response has a JSON content type and can be consumed by `SessionProvider`/`useSession` without `ClientFetchError` or an HTML parse error.
5. Auth.js endpoint operations used by the existing login/logout flow continue to return their standard Auth.js responses; the fix must not expose raw Prisma or configuration errors as HTML from a successfully matched route.

### R4. Verification and build hygiene

1. The implementation must verify that the route is present in the Next.js development/production route output, not only that the source file exists.
2. The route must compile with strict TypeScript and the current Next.js configuration.
3. No Prisma schema or database migration is required.
4. No unrelated source, dependency, environment, or configuration changes are permitted.

## Interfaces and file structure

### Existing Auth.js module

```ts
// auth.ts (existing public contract)
export const { handlers, auth, signIn, signOut } = NextAuth(options);
```

The implementation must preserve this named-export contract.

### Required Route Handler contract

```ts
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

The exact formatting may follow repository conventions, but the exported values must be the Auth.js `handlers.GET` and `handlers.POST` functions.

### Relevant file structure

```text
auth.ts                                      # unchanged Auth.js configuration/source
auth.config.ts                               # unchanged provider configuration
src/lib/auth.ts                              # unchanged auth re-export
src/app/api/auth/[...nextauth]/route.ts      # route wiring fix only
ai/features/auth-session-404/SPEC.md         # this specification
```

## Acceptance criteria

- **AC-01 — Canonical route:** `src/app/api/auth/[...nextauth]/route.ts` exists exactly at the App Router catch-all path and is the route serving `/api/auth/*`.
- **AC-02 — Correct wiring:** the route imports `handlers` from `@/auth` and exports both `GET` and `POST` directly from `handlers`; no custom session handler or duplicate session route exists.
- **AC-03 — Route registration:** a clean Next.js dev or production run recognizes `/api/auth/session` as a route handler; a request to it does not resolve to the app's HTML 404 page.
- **AC-04 — Unauthenticated contract:** with no Auth.js session cookie, `GET /api/auth/session` returns HTTP 200, a JSON content type, and the standard unauthenticated JSON value (`null`), with no `ClientFetchError`.
- **AC-05 — Authenticated contract:** with a valid existing session cookie, `GET /api/auth/session` returns HTTP 200 JSON and retains the current callback-populated `user.id`, `role`, business fields, and image behavior.
- **AC-06 — Client compatibility:** loading a page using the existing Auth.js client/session consumer produces no `Unexpected token '<'` error and no `GET /api/auth/session 404` entry.
- **AC-07 — Login/logout regression:** existing credentials and configured OAuth login/logout flows still reach Auth.js through the same route and preserve their current success, redirect, and error-page behavior.
- **AC-08 — Server-auth regression:** existing server actions and server components that call `auth()` continue to authenticate and authorize exactly as before; no caller-provided session or business identifier is introduced.
- **AC-09 — Configuration preservation:** `auth.ts`, `auth.config.ts`, Prisma adapter usage, JWT strategy, providers, callbacks, pages, and environment-variable contract are unchanged except for changes strictly required to compile the route.
- **AC-10 — Quality gate:** TypeScript, ESLint, and production build pass, and the implementation introduces no unrelated file or dependency changes.

## Testable scenarios for the implementation phase

1. **Static route test:** inspect the route file and assert the canonical `@/auth` import plus `GET`/`POST` exports; assert there is no second `/api/auth/session` implementation.
2. **Unauthenticated HTTP test:** start the app with valid non-secret test configuration, request `GET /api/auth/session` without cookies, and assert status 200, JSON content type, and body `null`.
3. **Authenticated HTTP test:** establish a valid existing Auth.js session using the project's supported credentials flow, request the endpoint with its cookie, and assert status 200 JSON plus the existing callback fields.
4. **HTML-regression test:** assert the session response body does not start with `<!DOCTYPE` and that its JSON parse succeeds.
5. **Auth flow regression:** exercise the existing sign-in and sign-out endpoints through `/api/auth/*`; assert they are handled by Auth.js rather than a Next.js 404 page.
6. **Build/manifest verification:** run the production build and start the built app, then repeat the unauthenticated session request to prove route registration survives production compilation.
7. **Server consumer regression:** invoke an existing authenticated server action and verify its result is unchanged, proving the route wiring did not replace or alter `auth()` configuration.

## Non-goals and rejected alternatives

- Do not add a hand-written `/api/auth/session` endpoint; it would bypass Auth.js cookie/token/session semantics.
- Do not move authentication to `middleware.ts` as a substitute for the session endpoint.
- Do not change providers, secrets, Prisma models, JWT/session callbacks, or authorization gates to address a route 404.
- Do not return an HTML or ad hoc JSON error from the route; Auth.js owns the endpoint response contract.
- Do not treat the successful home page or server action as evidence that the Auth.js route is registered; route discovery must be verified independently.
