#!/bin/bash
# Ralph Wiggum Stop Hook
# This hook intercepts exit attempts and feeds the prompt back if Ralph loop is active

set -e

STATE_FILE=".claude/ralph-loop.local.md"

# Check if Ralph loop is active
if [ ! -f "$STATE_FILE" ]; then
    # No active loop, allow exit
    echo '{"decision": "allow"}'
    exit 0
fi

# Read state from the file
ITERATION=$(grep "^iteration:" "$STATE_FILE" | cut -d' ' -f2)
MAX_ITERATIONS=$(grep "^max_iterations:" "$STATE_FILE" | cut -d' ' -f2)
COMPLETION_PROMISE=$(grep "^completion_promise:" "$STATE_FILE" | cut -d'"' -f2)

# Validate numbers
if ! [[ "$ITERATION" =~ ^[0-9]+$ ]]; then
    echo '{"decision": "allow", "message": "Ralph state corrupted (invalid iteration)"}'
    rm -f "$STATE_FILE"
    exit 0
fi

if ! [[ "$MAX_ITERATIONS" =~ ^[0-9]+$ ]]; then
    MAX_ITERATIONS=0  # 0 means unlimited
fi

# Check max iterations
if [ "$MAX_ITERATIONS" -gt 0 ] && [ "$ITERATION" -ge "$MAX_ITERATIONS" ]; then
    rm -f "$STATE_FILE"
    echo "{\"decision\": \"allow\", \"message\": \"Ralph loop completed (reached max iterations: $MAX_ITERATIONS)\"}"
    exit 0
fi

# Check for completion promise in Claude's output
TRANSCRIPT_FILE="$CLAUDE_TRANSCRIPT_PATH"
if [ -n "$COMPLETION_PROMISE" ] && [ -n "$TRANSCRIPT_FILE" ] && [ -f "$TRANSCRIPT_FILE" ]; then
    # Get last assistant message from transcript
    LAST_RESPONSE=$(tail -n 50 "$TRANSCRIPT_FILE" | grep -o "<promise>.*</promise>" | tail -1 || true)

    if [ -n "$LAST_RESPONSE" ]; then
        # Extract content between promise tags
        PROMISE_CONTENT=$(echo "$LAST_RESPONSE" | sed 's/<promise>//g' | sed 's/<\/promise>//g')

        if [ "$PROMISE_CONTENT" = "$COMPLETION_PROMISE" ]; then
            rm -f "$STATE_FILE"
            echo "{\"decision\": \"allow\", \"message\": \"Ralph loop completed (promise fulfilled: $COMPLETION_PROMISE)\"}"
            exit 0
        fi
    fi
fi

# Extract the prompt from state file (after YAML frontmatter)
PROMPT=$(awk '/^---$/ {count++; next} count==2 {print}' "$STATE_FILE")

# Increment iteration
NEW_ITERATION=$((ITERATION + 1))

# Update state file with new iteration
sed -i "s/^iteration: .*/iteration: $NEW_ITERATION/" "$STATE_FILE"
sed -i "s/^updated: .*/updated: $(date -Iseconds)/" "$STATE_FILE"

# Construct continuation message
SYSTEM_MSG="[Ralph Loop - Iteration $NEW_ITERATION"
if [ "$MAX_ITERATIONS" -gt 0 ]; then
    SYSTEM_MSG="$SYSTEM_MSG of $MAX_ITERATIONS"
fi
SYSTEM_MSG="$SYSTEM_MSG]\n\nYour previous work is preserved in files. Review your progress and continue.\n\n---\n\n$PROMPT"

# Block exit and feed the prompt back
cat << EOF
{
  "decision": "block",
  "message": "$SYSTEM_MSG"
}
EOF
