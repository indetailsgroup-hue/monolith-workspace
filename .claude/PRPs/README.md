# PRPs (Product Requirement Prompts) - Monolith

## What is PRP?

**PRD + Codebase Intelligence + Agent Runbook** = Minimum viable context for AI to ship production code

## Directory Structure

```
.claude/PRPs/
├── product-requirements/   # PRD-style specs with codebase context
├── implementation-plans/   # Step-by-step execution plans
├── reports/               # Completion reports, metrics
└── issue-investigations/  # Bug analysis and fix plans
```

## Workflow

### For New Features
```bash
# 1. Create PRP (Product Requirement Prompt)
#    - Define what to build
#    - Include file paths, patterns, validations

# 2. Create Implementation Plan
#    - Break into phases
#    - Define validation commands per phase

# 3. Execute (with Ralph for autonomous)
#    - Loop until all validations pass
```

### For Bug Fixes
```bash
# 1. Investigate issue
#    - Reproduce, locate root cause

# 2. Create fix plan
#    - Define validation (test passes, error gone)

# 3. Execute fix
```

## PRP Template

```markdown
# [Feature Name] - PRP

## Context
- **Codebase**: [relevant directories/files]
- **Dependencies**: [libraries, versions]
- **Related Code**: [existing patterns to follow]

## Requirements
1. [Requirement 1]
2. [Requirement 2]

## Implementation Guidance
- Follow pattern in `src/path/to/example.ts`
- Use existing `ComponentName` as reference
- Naming: `camelCase` for functions, `PascalCase` for types

## Validation Commands
```bash
npm run test -- --grep "feature"
npm run typecheck
npm run lint
```

## Success Criteria
- [ ] All validation commands pass
- [ ] No new TypeScript errors
- [ ] Tests cover happy path + edge cases
```

## Monolith-Specific Conventions

### File Locations
- Components: `src/components/`
- Stores: `src/core/store/`
- CNC: `src/cnc/` and `src/factory/cnc/`
- Types: co-located or in `types/` subdirectory

### Patterns
- Zustand + immer for state
- R3F for 3D components
- Vitest for testing
- Dark theme: `#1a1a2e` base

### Validation Commands
```bash
npx vitest run [path]           # Run specific tests
npx tsc --noEmit                # Type check
npm run lint                    # ESLint
```
