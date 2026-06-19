# Design: pre-commit-hooks

**Source:** C-18  
**Phase:** 1 — Quick Wins  

## Approach

### Step 1: Install dependencies
```bash
npm install --save-dev husky lint-staged
```

### Step 2: Initialize husky
```bash
npx husky init
```

### Step 3: Configure lint-staged
Add to `package.json`:
```json
"lint-staged": {
  "*.{ts,tsx}": ["next lint --max-warnings 0"]
}
```

Use tsc check as a separate pre-commit step (not in lint-staged since it needs full project context) or include it as a `tsc --noEmit` command in the hook.

### Step 4: Configure pre-commit hook
`.husky/pre-commit`:
```bash
npx lint-staged
npx tsc --noEmit
```

## Decision: tsc in pre-commit

`tsc --noEmit` is fast enough (~15s) for this project to run on every commit. If it becomes slow later, it can be moved to CI only. Including it ensures no type errors reach the remote.

## Rollback
```bash
npm uninstall husky lint-staged
rm -rf .husky
```
