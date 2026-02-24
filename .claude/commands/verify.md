# /verify - Run Full Verification Pipeline

Run all verification checks before committing code.

## Steps

1. **Run Unit Tests**
   ```bash
   npm run test:run
   ```
   If tests fail, analyze the failures and fix them.

2. **Run TypeScript Type Check**
   ```bash
   npm run typecheck:all
   ```
   If type errors exist, fix them.

3. **Run E2E Smoke Tests**
   ```bash
   npm run e2e:smoke
   ```
   If E2E tests fail, check for:
   - WebGL Context Lost errors
   - Missing elements
   - Timing issues

4. **Report Results**
   Summarize:
   - Unit test results (pass/fail count)
   - TypeScript errors (if any)
   - E2E test results

## Success Criteria
All three checks must pass before code can be committed.
