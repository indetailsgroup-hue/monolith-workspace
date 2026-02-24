#!/bin/bash
# Ralph Loop Setup Script
# Initializes a self-referential development loop

set -e

STATE_FILE=".claude/ralph-loop.local.md"

# Parse arguments
PROMPT=""
MAX_ITERATIONS=0
COMPLETION_PROMISE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --max-iterations)
            MAX_ITERATIONS="$2"
            if ! [[ "$MAX_ITERATIONS" =~ ^[0-9]+$ ]]; then
                echo "Error: --max-iterations must be a positive number"
                echo "Example: /ralph-loop \"Your task\" --max-iterations 20"
                exit 1
            fi
            shift 2
            ;;
        --completion-promise)
            COMPLETION_PROMISE="$2"
            shift 2
            ;;
        *)
            # Accumulate prompt parts
            if [ -z "$PROMPT" ]; then
                PROMPT="$1"
            else
                PROMPT="$PROMPT $1"
            fi
            shift
            ;;
    esac
done

# Validate prompt
if [ -z "$PROMPT" ]; then
    echo "Error: No prompt provided"
    echo ""
    echo "Usage: /ralph-loop \"Your task description\" [options]"
    echo ""
    echo "Options:"
    echo "  --max-iterations <n>      Stop after N iterations"
    echo "  --completion-promise <text>  Stop when this phrase is output in <promise> tags"
    echo ""
    echo "Example:"
    echo "  /ralph-loop \"Build a REST API. Output <promise>COMPLETE</promise> when done.\" --completion-promise COMPLETE --max-iterations 30"
    exit 1
fi

# Check if loop already active
if [ -f "$STATE_FILE" ]; then
    CURRENT_ITER=$(grep "^iteration:" "$STATE_FILE" | cut -d' ' -f2)
    echo "Warning: Ralph loop already active at iteration $CURRENT_ITER"
    echo "Use /cancel-ralph to stop the current loop first."
    exit 1
fi

# Create state file
mkdir -p "$(dirname "$STATE_FILE")"

cat > "$STATE_FILE" << EOF
---
active: true
iteration: 1
max_iterations: $MAX_ITERATIONS
completion_promise: "$COMPLETION_PROMISE"
created: $(date -Iseconds)
updated: $(date -Iseconds)
---

$PROMPT
EOF

# Output setup message
echo "=== Ralph Loop Initialized ==="
echo ""
echo "Iteration: 1"
if [ "$MAX_ITERATIONS" -gt 0 ]; then
    echo "Max Iterations: $MAX_ITERATIONS"
else
    echo "Max Iterations: unlimited"
fi
if [ -n "$COMPLETION_PROMISE" ]; then
    echo "Completion Promise: \"$COMPLETION_PROMISE\""
    echo ""
    echo "To complete: Output <promise>$COMPLETION_PROMISE</promise> when truly done"
fi
echo ""
echo "WARNING: This loop cannot be stopped manually!"
echo "It will run until max iterations or completion promise."
echo "Use /cancel-ralph to abort if needed."
echo ""
echo "=== Starting Loop ==="
echo ""
echo "$PROMPT"
