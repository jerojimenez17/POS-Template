This repository uses a multi-agent AI development workflow.

Agents available:

- Architect
- QA Engineer
- Developer
- Reviewer

Workflow:

1. Architect analyzes the feature request.
2. QA agent writes tests first (TDD).
3. Developer implements code to pass tests.
4. Tests are executed.
5. Reviewer validates code quality.

Rules:

- Architect does not write code.
- QA writes tests only.
- Developers cannot modify tests.
- All work must follow the workflow defined in /ai/workflows.