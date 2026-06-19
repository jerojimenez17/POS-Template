# Spec: dead-code-removal

**Source:** C-17 (docs/enhancements/03-cons.md)  
**Phase:** 1 — Quick Wins  
**Effort:** ~2 days  
**Risk:** Low  

## Requirements

### R1: Remove commented SeedButton
- Remove the commented `<SeedButton />` block from `src/app/(protected)/newBill/page.tsx`
- Verify no other commented code exists in nearby sections

### R2: Audit Firebase legacy
- Check every file under `src/firebase/stock/`, `src/firebase/orders/`, `src/firebase/clients/` for active imports
- Any file with ZERO active references → delete it
- Keep `src/firebase/config.ts` and anything related to Firebase Storage (images)
- Document the audit in a comment or remove silently

### R3: Remove unused imports
- Scan component files for unused imports across the codebase
- Remove them carefully — verify the import isn't used for types or side effects

### R4: No breaking changes
- All removals are safe deletions — no functional code removed
- No data layer changes — Firebase config preserved
- No type errors introduced

## Scenarios

### S1: Happy path
1. Dev removes commented SeedButton → codebase cleaner
2. Dev audits Firebase → removes 10+ legacy files with zero references
3. Dev removes unused imports → cleaner imports
4. `npx tsc --noEmit` passes with zero errors

### S2: Firebase file has active reference
1. Audit finds `src/firebase/stock/getProduct.ts` imported by a component
2. That file is kept (not deleted)
3. Consider adding a `@deprecated` JSDoc tag

### S3: Import removal causes type error
1. Unused import removal breaks a type reference
2. Dev restores the import or adds explicit type import
3. `tsc --noEmit` passes before commit

## Acceptance Criteria

- [ ] R1: Commented SeedButton removed from `newBill/page.tsx`
- [ ] R2: Firebase files with zero references deleted; config.ts preserved
- [ ] R3: Unused imports removed across the codebase
- [ ] R4: `npx tsc --noEmit` passes with zero errors
- [ ] R4: `npm run build` succeeds (no build errors)
