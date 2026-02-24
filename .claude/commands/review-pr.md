# /review-pr - AI Code Review

Perform a thorough code review on the current changes.

## Review Checklist

### 1. Code Quality
- [ ] TypeScript strict mode compliance
- [ ] No `any` types without justification
- [ ] Proper error handling
- [ ] Functions are not too long (< 50 lines)

### 2. Performance
- [ ] No console.log in render paths
- [ ] Geometries/textures properly memoized
- [ ] useEffect cleanup functions present
- [ ] No unnecessary re-renders

### 3. Security
- [ ] No hardcoded secrets
- [ ] Input validation present
- [ ] XSS prevention (no dangerouslySetInnerHTML)

### 4. Testing
- [ ] Unit tests for new functions
- [ ] Edge cases covered
- [ ] Mocks properly cleaned up

### 5. Documentation
- [ ] JSDoc for public APIs
- [ ] Complex logic commented
- [ ] README updated if needed

## Review Process

1. Get the diff:
   ```bash
   git diff HEAD~1
   ```

2. Analyze each changed file

3. Report findings with severity:
   - 🔴 **Critical** - Must fix before merge
   - 🟡 **Warning** - Should fix
   - 🔵 **Info** - Suggestion

4. Provide specific fix recommendations
