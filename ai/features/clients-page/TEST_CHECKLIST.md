# Clients page QA checklist

## Positive scenarios

- [ ] An authenticated user with `businessId` receives only that business's clients.
- [ ] The first page is bounded (25 by default, never an unbounded `findMany`) and uses stable `name ASC, id ASC` ordering.
- [ ] Cursor pagination loads 25, 25, then 26 records for 76 clients; repeated clicks do not duplicate records and the button disappears at the end.
- [ ] Search trims whitespace, is case-insensitive, and matches name, phone, email, and CUIT.
- [ ] A newer search response wins over an older in-flight response; changing search resets cursor and loaded pages.
- [ ] Valid create sends only editable fields, fixes business ownership from the session, and persists balance `0`.
- [ ] Valid edit changes editable fields and `last_update` only; balance, business, date, and orders remain unchanged.
- [ ] Deleting an owned client without orders removes it and reconciles the visible list.
- [ ] Client form is prefilled and resets when switching from one client to another.
- [ ] Legacy `GET /api/clients` still returns `{ clients: [...] }`; the selection modal can load, create, and select a client.
- [ ] Desktop exposes an accessible table; mobile exposes compact cards without horizontal page overflow.
- [ ] Controls have accessible names, visible keyboard focus, and status/alert announcements.

## Negative and authorization scenarios

- [ ] Missing session or missing `session.user.businessId` returns `UNAUTHORIZED`/401 and performs no client query.
- [ ] A user from business A cannot read, update, delete, or change the balance of a business B client, even when given B's ID.
- [ ] Browser-supplied `businessId`, `balance`, `orders`, `date`, `last_update`, or unknown fields are rejected by strict mutation schemas; no write occurs.
- [ ] Missing/blank name, invalid email, invalid IVA condition, and all maximum-length violations return `VALIDATION` with a user-readable message.
- [ ] Invalid cursor and limits outside 1..50 return `VALIDATION` without a database query.
- [ ] Missing, already deleted, foreign, or nonexistent client returns controlled `NOT_FOUND`/`FORBIDDEN`.
- [ ] A client with historical orders returns `CONFLICT`, preserves the client and orders, and never calls delete.
- [ ] Canceling deletion closes the dialog and does not call the delete action.
- [ ] Mutation failures preserve form values, expose `role="alert"`, and do not incorrectly remove or add a row.
- [ ] Incremental-load failures show a retry action and preserve already loaded pages.
- [ ] Legacy API without authentication returns 401 and does not query the database.

## Edge cases

- [ ] Empty database shows collection-empty copy and a create CTA.
- [ ] A non-empty database with zero matches shows search-empty copy and “Limpiar búsqueda”, not a collection error.
- [ ] Initial failure, incremental failure, and loading skeleton are distinct semantic states.
- [ ] A client with null optional fields renders safely; long names/emails/CUITs truncate or wrap without overflow.
- [ ] Rapid search changes cannot append stale pages or duplicate IDs.
- [ ] Double-clicking load more or mutation controls cannot issue duplicate requests; unrelated search/navigation remains usable.
- [ ] 320px viewport, keyboard-only operation, light theme, and dark theme remain usable.

## Expected error contracts

| Condition | Expected result |
| --- | --- |
| No session/business | `{ success: false, code: "UNAUTHORIZED" }`; API status 401 and “No autorizado” |
| Invalid input/query/cursor | `{ success: false, code: "VALIDATION" }`; no DB write/query |
| Foreign/missing client | Controlled `NOT_FOUND` or `FORBIDDEN`; no mutation |
| Existing historical orders | `{ success: false, code: "CONFLICT" }`; Spanish explanation that history prevents deletion |
| Database failure | `{ success: false, code: "DATABASE" }`; no sensitive payload/SQL details exposed |
| Form validation | `role="alert"`, Spanish field error, entered values retained |
| Recoverable load failure | `role="alert"` plus “Reintentar”; existing loaded data is retained |
