# Antigravity Audit Prompts

> Standardized prompts for Claude IDE to perform gate audits

---

## Available Prompts

| Prompt | Gate | Purpose |
|--------|------|---------|
| [antigravity_gate09_persistence_audit.md](antigravity_gate09_persistence_audit.md) | G9 | Branded types, persistence validation |
| [antigravity_gate10_dual_audit.md](antigravity_gate10_dual_audit.md) | G10 | DXF safety (deterministic + semantic) |
| [antigravity_bypass_scan_audit.md](antigravity_bypass_scan_audit.md) | ALL | CI bypass pattern scanning |

---

## Quick Start

### Single Gate Audit

```bash
# Copy prompt content and paste into Claude IDE
cat .claude/prompts/antigravity_gate10_dual_audit.md | pbcopy  # macOS
cat .claude/prompts/antigravity_gate10_dual_audit.md | clip    # Windows
```

### Full Audit (Both Gates)

Run both prompts sequentially:

1. Run G9 Persistence Audit first (foundational)
2. Run G10 DXF Audit second (depends on G9 types)

---

## Prompt Structure

Each prompt follows the same structure:

```
1. ROLE           - Auditor persona
2. SOURCE OF TRUTH - Spec document reference
3. GLOBAL RULES   - Non-negotiable constraints
4. INVARIANTS     - What must be true
5. TASK           - Audit steps
6. OUTPUT FORMAT  - Report template (mandatory)
```

---

## Expected Output

Each audit produces a standardized report:

```markdown
# GATE{N} AUDIT REPORT

## 1) Executive Verdict
Status: ✅ PASS / ❌ FAIL

## 2) Evidence Summary
(table of test results)

## 3-6) Detailed Findings
(varies by gate)

## 7) Actions Required (if FAIL)
(ordered fix list)
```

---

## Strict Mode

Add this line to any prompt for aggressive auditing:

> "If you cannot produce evidence for a claim, mark it as UNSUPPORTED and FAIL the gate."

---

## CI Integration

Example GitHub Actions workflow:

```yaml
name: Gate Audit
on: [pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run G9 Tests
        run: npm run test:run -- src/core/gate/__tests__/g9

      - name: Run G10 Tests
        run: npm run test:run -- src/core/gate

      - name: Static Bypass Scan
        run: |
          # G9 scans
          ! grep -rn "as Verified" src/ --include="*.ts" | grep -v "Factory\|create\|test"
          ! grep -rn "__brand:" src/ --include="*.ts"

          # G10 scans
          ! grep -r "as SafeDxf" src/ --include="*.ts"
          ! grep -r "operationGraphToDxf(" src/ --include="*.ts" | grep -v dxfExportFromOperationGraph | grep -v test
```

---

## Adding New Gate Prompts

Template:

```markdown
# Antigravity: GATE{N} {Name} Audit

> **Version**: 1.0.0
> **Target**: GATE{N} ({sub-gates})
> **Source of Truth**: `.claude/gates/GATE{N}_{NAME}.md`

## ROLE
(auditor persona)

## SOURCE OF TRUTH
(spec document)

## NON-NEGOTIABLE GLOBAL RULES
(constraints)

## AUDIT INVARIANTS
(what must be true)

## TASK
(audit steps with commands)

## OUTPUT FORMAT
(mandatory report template)
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-02 | Initial pack (G9 + G10) |
