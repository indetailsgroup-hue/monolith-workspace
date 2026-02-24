---
name: ralph-help
description: Show Ralph Wiggum plugin help
hidden: true
---

# Ralph Wiggum Plugin Help

## What is Ralph?

Ralph Wiggum is an iterative development technique where Claude runs in a continuous loop,
repeatedly receiving the same prompt until the task is genuinely complete.

Your previous work persists in files between iterations, allowing you to:
- Review what you've built
- See test results and errors
- Make incremental improvements
- Learn from failures

## Commands

### /ralph-loop

Start an iterative development loop.

```
/ralph-loop "Build a REST API with tests. Output <promise>COMPLETE</promise> when all tests pass." --completion-promise COMPLETE --max-iterations 30
```

**Options:**
- `--max-iterations <n>` - Safety limit (recommended!)
- `--completion-promise <text>` - Exit phrase (must use `<promise>` tags)

### /cancel-ralph

Abort the current Ralph loop immediately.

```
/cancel-ralph
```

## Best Practices

1. **Always set max-iterations** - Prevents infinite loops
2. **Clear completion criteria** - Define what "done" means
3. **Use with PRPs** - Combine with Product Requirement Prompts for best results
4. **Test-driven** - Let tests guide your iterations
5. **Incremental progress** - Build features step by step

## Warning

Ralph loops cannot be stopped manually (by design). Always use:
- `--max-iterations` as a safety net
- `/cancel-ralph` if you need to abort

## Example with PRPs

```
/ralph-loop "
Implement the Connectors Configuration system per the PRP.

Reference: .claude/PRPs/product-requirements/connectors-configuration.md
Plan: .claude/PRPs/implementation-plans/connectors-configuration-plan.md

Validation:
- npx tsc --noEmit
- npx vitest run src/components/ui --reporter=verbose

When ALL success criteria from the PRP are met, output:
<promise>CONNECTORS_CONFIG_COMPLETE</promise>
" --completion-promise CONNECTORS_CONFIG_COMPLETE --max-iterations 30
```
