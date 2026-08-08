# TEST_CHECKLIST.md — Account Notes Field

## Acceptance Criteria → Test Mapping

| AC | Description | Test File | Test Name | Status |
|----|-------------|-----------|-----------|--------|
| **AC-01** | Order model has optional `notes` field (String?) | *(Schema — verified via Prisma schema inspection)* | — | ❌ FAIL |
| **AC-02** | Can save notes when creating an order via API/action | `src/__tests__/account-notes/notes.test.ts` | `AC-02: passes notes to db.order.create when notes are provided` | ❌ FAIL |
| **AC-02** | `getUnpaidOrders` returns orders that include `notes` field | `src/__tests__/account-notes/notes.test.ts` | `AC-02: returns orders that include notes field in the data` | ❌ FAIL |
| **AC-03** | Notes appear below client name in table row (smaller, muted text) | `src/__tests__/account-notes/NotesDisplay.test.tsx` | `renders notes text when notes is a non-empty string` | ❌ FAIL |
| **AC-03** | Notes have `text-xs` class for small font | `src/__tests__/account-notes/NotesDisplay.test.tsx` | `renders notes with text-xs class for small font` | ❌ FAIL |
| **AC-03** | Notes have `text-muted-foreground` class for muted color | `src/__tests__/account-notes/NotesDisplay.test.tsx` | `renders notes with text-muted-foreground class for muted color` | ❌ FAIL |
| **AC-03** | Notes have `line-clamp-2` for truncation | `src/__tests__/account-notes/NotesDisplay.test.tsx` | `renders notes with line-clamp-2 class for truncation` | ❌ FAIL |
| **AC-03** | Notes have `title` attribute for hover | `src/__tests__/account-notes/NotesDisplay.test.tsx` | `renders notes with title attribute containing full text for hover` | ❌ FAIL |
| **AC-04** | Table row looks normal when no notes exist — no layout shift | `src/__tests__/account-notes/NotesDisplay.test.tsx` | `renders nothing when notes is null` | ❌ FAIL |
| **AC-04** | No empty `<p>` tags when notes is null | `src/__tests__/account-notes/NotesDisplay.test.tsx` | `does not render empty <p> tags when notes is null` | ❌ FAIL |
| **AC-05** | Notes visible on account detail page | `src/__tests__/account-notes/NotesDisplay.test.tsx` | `renders notes in detail variant with label and text` | ❌ FAIL |
| **AC-05** | Detail variant renders with `whitespace-pre-wrap` | `src/__tests__/account-notes/NotesDisplay.test.tsx` | `detail variant renders with whitespace-pre-wrap class` | ❌ FAIL |
| **AC-06** | Existing orders without notes do NOT break | `src/__tests__/account-notes/notes.test.ts` | `AC-06: existing createUnpaidOrder functionality still works when notes is omitted` | ❌ FAIL |
| **AC-06** | Existing orders without notes do NOT break (UI) | `src/__tests__/account-notes/NotesDisplay.test.tsx` | `renders without crashing when notes is null` | ❌ FAIL |
| **AC-07** | Backend accepts empty notes without error | `src/__tests__/account-notes/notes.test.ts` | `AC-07: creates order successfully when notes field is omitted` | ❌ FAIL |
| **AC-07** | Backend accepts null notes without error | `src/__tests__/account-notes/notes.test.ts` | `AC-07: creates order successfully when notes is null` | ❌ FAIL |
| **AC-07** | Backend accepts empty string notes without error | `src/__tests__/account-notes/notes.test.ts` | `AC-07: creates order successfully when notes is empty string` | ❌ FAIL |

## Test Execution

Run all tests with:
```bash
npm run test -- src/__tests__/account-notes/
```

Or run individual test files:
```bash
npm run test -- src/__tests__/account-notes/notes.test.ts
npm run test -- src/__tests__/account-notes/NotesDisplay.test.tsx
```

## Expected Initial State

All tests are expected to **FAIL** initially because the implementation has not been updated yet:
- `CreateUnpaidOrderInput` interface does not have `notes?: string`
- `createUnpaidOrder` does not pass `notes` to `tx.order.create`
- `getUnpaidOrders` does not include `notes` in returned data
- The account-ledger table and detail page do not render notes

## Test File Locations

| File | Purpose |
|------|---------|
| `src/__tests__/account-notes/notes.test.ts` | Backend tests for Server Action notes handling |
| `src/__tests__/account-notes/NotesDisplay.test.tsx` | UI tests for notes rendering in table and detail views |
