# Orchestration Reference

Reference document for the Orchestrator Agent's delegation rules, skill mappings, and iteration limits.

---

## Skill → Agent Mapping (Detailed)

### Step 1: Architect

| Source | Purpose |
|--------|---------|
| `ai/agents/architect.md` | Role definition + constraints |
| `ai/skills/prisma-postgresql/SKILL.md` | Data modeling expertise |
| `ai/skills/nextjs-development/SKILL.md` | Next.js architecture patterns |
| `AGENTS.md` | Project conventions, naming, file structure |

**Output:** `ai/features/{name}/SPEC.md`

---

### Step 2: QA Writes Tests

| Source | Purpose |
|--------|---------|
| `ai/agents/qa.md` | Role definition + constraints |
| `ai/skills/vitest-testing-library/SKILL.md` | Testing patterns, mocking, RTL queries |
| `ai/project-context.md` | Stack overview |

**Output:** `*.test.ts` / `*.test.tsx` files + `ai/features/{name}/TEST_CHECKLIST.md`

---

### Step 3: Developer Implements

| Source | Purpose |
|--------|---------|
| `ai/agents/dev.md` | Role definition + constraints |
| `ai/skills/nextjs-development/SKILL.md` | Server Components, Server Actions, data fetching |
| `ai/skills/prisma-postgresql/SKILL.md` | Prisma queries, transactions, schema |
| `ai/skills/web-design-guidelines/SKILL.md` | Accessibility, responsive design |
| `AGENTS.md` | Full project conventions |

**Output:** Implementation files in `src/`

---

### Step 4: QA Executes Tests

| Source | Purpose |
|--------|---------|
| `ai/agents/qa.md` | Role definition + constraints |
| `ai/skills/vitest-testing-library/SKILL.md` | Running tests, interpreting failures |
| Previous test output | Context |

**Output:** Test results (pass/fail report)

---

### Step 5: Developer Fixes

| Source | Purpose |
|--------|---------|
| Same as Step 3 | Full developer context |
| Test failure output | Specific errors to fix |

**Output:** Fixed implementation files

---

### Step 6: Reviewer Validates

| Source | Purpose |
|--------|---------|
| `ai/agents/reviewer.md` | Role definition + constraints |
| `AGENTS.md` | Project conventions for validation |

**Output:** Approval or change requests

---

## Iteration Limits

| Loop | Max Iterations | Action on Exceed |
|------|---------------|------------------|
| Step 4 → Step 5 (test failures) | 3 | Escalate to user with summary of remaining failures |
| Step 6 → Step 3 (reviewer rejection) | 2 | Escalate to user with reviewer's change requests |

---

## Validation Gates

| Gate | Step | Check |
|------|------|-------|
| G1 | After Step 1 | `SPEC.md` exists and has acceptance criteria |
| G2 | After Step 2 | Test files exist and compile (even if failing) |
| G3 | After Step 3 | Implementation files exist, tests still fail (TDD) |
| G4 | After Step 5 | `npm run test` passes, `npm run lint` passes, `npx tsc --noEmit` passes |
| G5 | After Step 6 | All gates passed + reviewer approved |

---

## Output Directory Structure

```
ai/features/{feature-name}/
├── SPEC.md              # From Architect
├── TEST_CHECKLIST.md    # From QA
└── *.test.ts[x]         # Test files
```
