# TDD Feature Development Workflow

This workflow defines the process for developing new features using Test Driven Development.

## Workflow Overview

| Step | Agent | Action |
|------|-------|--------|
| 1 | Architect | Analyze feature request |
| 2 | QA | Write failing tests |
| 3 | Developer | Implement code |
| 4 | QA | Execute tests |
| 5 | Developer | Fix failing tests |
| 6 | Reviewer | Validate code quality |

---

## Step 1: Architect Analyzes Feature Request

**Agent:** Architect

**Input:** Feature request from user (e.g., "Add export to PDF functionality")

**Actions:**
1. Review the feature request and clarify any ambiguities
2. Analyze technical requirements and constraints
3. Identify dependencies (database models, API integrations, etc.)
4. Design the solution architecture
5. Write SPEC.md with:
   - Detailed requirements
   - Acceptance criteria (measurable conditions)
   - Data models and interfaces
   - File structure recommendations

**Output:** `SPEC.md` in the feature branch

---

## Step 2: QA Writes Tests

**Agent:** QA Engineer

**Input:** SPEC.md from Architect

**Actions:**
1. Review SPEC.md and identify all testable scenarios
2. Create test file following project conventions (see `vitest-testing-library` skill)
3. Write failing tests that define expected behavior:
   - Unit tests for utilities
   - Component tests for UI
   - Integration tests for Server Actions
4. Create `TEST_CHECKLIST.md` with:
   - All acceptance criteria as checkable items
   - Positive, negative, and edge case scenarios
   - Expected error messages
5. Ensure tests are deterministic (no flaky tests)

**Output:** Test files and TEST_CHECKLIST.md

---

## Step 3: Developer Implements Code

**Agent:** Developer

**Input:** Failing tests from QA

**Actions:**
1. Review SPEC.md and failing tests
2. Write minimal code to make tests pass:
   - Follow project conventions (check AGENTS.md)
   - Use TypeScript strict mode
   - Use Zod for validation (see `prisma-postgresql` skill)
3. Run tests frequently during development
4. Implement error handling with proper messages
5. Do NOT modify test files - only implementation

**Output:** Implementation code

---

## Step 4: Tests Are Executed

**Agent:** QA Engineer

**Input:** Implementation from Developer

**Actions:**
1. Run all tests: `npm run test` (or equivalent)
2. Verify all new tests pass
3. Verify no regressions in existing tests
4. Document any test failures with evidence

**Output:** Test results

---

## Step 5: Developer Fixes Failing Tests

**Agent:** Developer

**Input:** Test failures from Step 4

**Actions:**
1. Analyze test failure messages
2. Fix implementation to pass tests:
   - Fix bugs in the code
   - Handle edge cases
   - Update incorrect logic
3. Re-run tests after each fix
4. Ensure all tests pass before proceeding

**Output:** Fixed implementation

---

## Step 6: Reviewer Validates Code Quality

**Agent:** Reviewer

**Input:** Passing tests and implementation

**Actions:**
1. Review implementation against SPEC.md:
   - All acceptance criteria met
   - No scope creep
   - All features implemented
2. Run lint and typecheck:
   - `npm run lint`
   - `npm run typecheck` (or `npx tsc --noEmit`)
3. Review code quality:
   - Proper TypeScript typing
   - Security best practices
   - No secrets exposed
   - Error handling in place
4. Verify test quality:
   - Good coverage
   - Edge cases handled
   - Tests are maintainable
5. Provide approval or request changes

**Output:** Review approval or change requests

---

## Complete Workflow Example

```
User Request: "Add order cancellation feature"

├── Step 1: Architect
│   └── Creates SPEC.md with requirements
│
├── Step 2: QA
│   ├── Writes tests/orders/cancel-order.test.ts
│   └── Creates TEST_CHECKLIST.md
│
├── Step 3: Developer
│   ├── Implements actions/cancel-order.ts
│   └── Runs tests → fails (expected)
│
├── Step 4: QA
│   └── Executes tests → reports failures
│
├── Step 5: Developer
│   ├── Fixes implementation
│   └── Re-runs tests → pass
│
└── Step 6: Reviewer
    ├── Runs lint + typecheck
    ├── Reviews code against spec
    └── Approves or requests changes
```

---

## Workflow Files

- `SPEC.md` - Feature specification
- `TEST_CHECKLIST.md` - Test checklist
- `*.test.ts` / `*.test.tsx` - Test files

---

## Commands Reference

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test -- --watch

# Run linting
npm run lint

# Run TypeScript check
npx tsc --noEmit

# Generate Prisma client
npx prisma generate

# Push schema changes
npx prisma db push
```
