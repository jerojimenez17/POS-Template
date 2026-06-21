# Spec: pre-commit-hooks

**Source:** C-18  
**Phase:** 1 — Quick Wins  

## Requirements

### R1: Install Husky
- Install `husky` v9 as devDependency
- Initialize git hooks via `npx husky init`
- Create `.husky/pre-commit` hook

### R2: Install lint-staged
- Install `lint-staged` as devDependency
- Configure in `package.json` under `lint-staged` key

### R3: Configure lint-staged
- TypeScript check: `tsc --noEmit` on all files (project-wide)
- ESLint: `next lint` on staged `.ts`/`.tsx`/`.tsx` files
- No test runner configured yet — skip tests in pre-commit to avoid slow hooks

### R4: Verify hook works
- `git commit` triggers husky → lint-staged → tsc + eslint
- No breaking changes to commit workflow

## Acceptance Criteria
- [ ] husky + lint-staged installed
- [ ] `.husky/pre-commit` exists and is executable
- [ ] `lint-staged` configured in package.json
- [ ] Staged files checked on commit
