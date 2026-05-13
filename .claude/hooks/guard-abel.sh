#!/usr/bin/env bash
set -euo pipefail

INPUT="$(cat)"

COMMAND="$(python3 - <<'PY' "$INPUT"
import json, sys
try:
    data = json.loads(sys.argv[1])
    print(data.get("tool_input", {}).get("command", ""))
except Exception:
    print("")
PY
)"

# Block Graphify extraction/update paths. Query/explain/path are allowed by omission.
if echo "$COMMAND" | grep -Eq 'graphify (extract|update|hook|claude install)|graphify\.extract|\.graphify_python|/graphify'; then
  cat <<'JSON'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Blocked by Abel Graphify Safety. Do not rebuild, update, or extract Graphify unless explicitly unblocked."
  }
}
JSON
  exit 0
fi

# Block accidental visual corpus processing through shell commands.
if echo "$COMMAND" | grep -Eq 'reference-img|reference-images|\.png|\.jpg|\.jpeg|\.webp|\.gif'; then
  if echo "$COMMAND" | grep -Eq 'graphify|graphify-out|\.graphify'; then
    cat <<'JSON'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Blocked: Graphify/image-reference operation detected."
  }
}
JSON
    exit 0
  fi
fi

exit 0
