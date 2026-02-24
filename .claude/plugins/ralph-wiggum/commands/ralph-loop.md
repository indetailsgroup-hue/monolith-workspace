---
name: ralph-loop
description: Start Ralph Wiggum loop in current session
allowed_tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Task
arguments:
  - name: prompt
    description: The task prompt to execute iteratively
    required: true
  - name: --max-iterations
    description: Maximum number of iterations before stopping
    required: false
  - name: --completion-promise
    description: Exact phrase that signals task completion (use with <promise> tags)
    required: false
---

Start a Ralph Wiggum loop - a self-referential development loop that runs until completion.

**CRITICAL**: The completion promise must be output wrapped in `<promise></promise>` tags.
Only output the completion promise when the claim is **completely and unequivocally TRUE**.
Do NOT output false promises as an exit strategy - the loop will persist until genuine completion.

## How it works:

1. Your prompt is saved to `.claude/ralph-loop.local.md`
2. When you try to exit, the Stop hook intercepts and feeds the prompt back
3. Your previous work persists in files - review and improve each iteration
4. Loop ends when: max iterations reached OR completion promise output

## Usage:

```
/ralph-loop "Your task description" --max-iterations 30 --completion-promise "DONE"
```

## Best practices:

1. Always set `--max-iterations` as a safety limit
2. Include clear completion criteria in your prompt
3. Use `<promise>SIGNAL</promise>` format in your task description
4. Be specific about what "done" means

## Execution:

Run: `"${CLAUDE_PLUGIN_ROOT}/scripts/setup-ralph-loop.sh" $ARGUMENTS`
