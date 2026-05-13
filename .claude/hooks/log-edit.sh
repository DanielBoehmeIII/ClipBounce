#!/usr/bin/env bash
set -euo pipefail

mkdir -p .claude

INPUT="$(cat)"

python3 - <<'PY' "$INPUT" >> .claude/agent-edit-log.md
import json, sys, datetime

try:
    data = json.loads(sys.argv[1])
except Exception:
    data = {}

tool = data.get("tool_name", "unknown")
tool_input = data.get("tool_input", {})
path = tool_input.get("file_path") or tool_input.get("path") or "(unknown file)"
now = datetime.datetime.now().isoformat(timespec="seconds")

print(f"- {now} | {tool} | {path}")
PY

exit 0
