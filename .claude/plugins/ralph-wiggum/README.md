# Ralph Wiggum Plugin

Implementation of the Ralph Wiggum technique for iterative AI development loops.

## Overview

Ralph Wiggum creates a self-referential feedback loop where:
1. Claude receives a prompt
2. Claude works on the task
3. When Claude tries to exit, the Stop hook intercepts
4. The same prompt is fed back with context about previous work
5. Repeat until completion criteria are met

## Installation

This plugin is installed in `.claude/plugins/ralph-wiggum/`.

To enable, ensure Claude Code can find the plugin by adding to your project's `.claude/settings.json`:

```json
{
  "plugins": {
    "ralph-wiggum": ".claude/plugins/ralph-wiggum"
  }
}
```

## Commands

### `/ralph-loop`

Start an iterative development loop:

```bash
/ralph-loop "Your task prompt" --max-iterations 30 --completion-promise "DONE"
```

### `/cancel-ralph`

Abort the current loop:

```bash
/cancel-ralph
```

## Usage with PRPs

Best results when combined with Product Requirement Prompts:

```bash
/ralph-loop "
Implement the feature per the PRP.

Reference: .claude/PRPs/product-requirements/feature.md
Plan: .claude/PRPs/implementation-plans/feature-plan.md

Validation: npx tsc --noEmit && npx vitest run

When complete, output: <promise>FEATURE_COMPLETE</promise>
" --completion-promise FEATURE_COMPLETE --max-iterations 30
```

## Safety

**WARNING**: Ralph loops persist until completion. Always:
- Set `--max-iterations` as a safety limit
- Use `/cancel-ralph` if you need to abort
- Define clear completion criteria

## Files

- `.claude/ralph-loop.local.md` - Active loop state (created when loop starts)
- Delete this file manually to force-stop a stuck loop

## Credits

Original Ralph technique by Geoffrey Huntley: https://ghuntley.com/ralph/
Plugin implementation by Daisy Hollman (Anthropic)
