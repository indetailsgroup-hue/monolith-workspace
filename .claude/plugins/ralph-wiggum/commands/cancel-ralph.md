---
name: cancel-ralph
description: Cancel active Ralph Wiggum loop
hidden: true
allowed_tools:
  - Bash
  - Read
---

Cancel an active Ralph Wiggum loop.

## Steps:

1. Check if `.claude/ralph-loop.local.md` exists using Bash:
   ```bash
   test -f .claude/ralph-loop.local.md && echo "exists" || echo "not found"
   ```

2. If not found, respond: "No active Ralph loop found."

3. If found:
   - Read the file to get current iteration number
   - Delete the file: `rm .claude/ralph-loop.local.md`
   - Respond: "Cancelled Ralph loop (was at iteration N)"
