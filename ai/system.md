This repository uses a multi-agent AI development workflow with an Orchestrator delegating to specialized sub-agents.

Agents available:

- **Orchestrator** — Delegates each TDD step to sub-agents, loads relevant skills, validates outputs, manages feedback loops
- Architect — Designs solution architecture and writes SPEC.md
- QA Engineer — Writes failing tests and executes them against implementation
- Developer — Implements code to pass tests (does NOT modify tests)
- Reviewer — Validates code quality against SPEC.md

Workflow (managed by Orchestrator):

1. Orchestrator receives feature request and creates `ai/features/{name}/` workspace
2. Orchestrator delegates to Architect → outputs SPEC.md
3. Orchestrator delegates to QA → writes failing tests + TEST_CHECKLIST.md
4. Orchestrator delegates to Developer → implements code
5. Orchestrator delegates to QA → executes tests, reports results
6. Orchestrator delegates to Developer → fixes failing tests (loop with QA up to 3x)
7. Orchestrator delegates to Reviewer → validates quality, lint, typecheck

Rules:

- Architect does not write code or tests
- QA writes tests only — cannot modify source code
- Developers cannot modify tests — only implementation
- Orchestrator does not write code, tests, or specs — only delegates
- Each sub-agent receives the relevant skill file for domain expertise
- All work must follow the workflow defined in /ai/workflows
- Skill mapping defined in ai/agents/orchestrator.md and ai/workflows/orchestration.md