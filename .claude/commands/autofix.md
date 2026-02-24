# /autofix - Automated Bug Fixing Pipeline

Automatically diagnose and fix common issues.

## Pipeline Steps

### 1. Diagnose
Run diagnostics to identify issues:
```bash
npm run test:run 2>&1 | head -100
npm run typecheck:all 2>&1 | head -50
```

### 2. Categorize Issues
Group issues by type:
- **Type Errors**: Missing types, incompatible types
- **Test Failures**: Assertion failures, timeouts
- **Runtime Errors**: Undefined access, null references

### 3. Auto-Fix Process

For each issue:
1. Read the failing file
2. Understand the error context
3. Apply the appropriate fix
4. Re-run the specific test

### 4. Verification
After all fixes:
```bash
npm run verify
```

## Fix Strategies

### Type Errors
- Add missing type annotations
- Fix incompatible type assignments
- Add null checks where needed

### Test Failures
- Update outdated snapshots
- Fix assertion expectations
- Add missing mocks

### Runtime Errors
- Add optional chaining (?.)
- Add nullish coalescing (??)
- Validate inputs

## Safety Rules
- Never modify test assertions to match buggy code
- Always understand the root cause before fixing
- Create new tests for edge cases discovered
- Run full verification after fixes
