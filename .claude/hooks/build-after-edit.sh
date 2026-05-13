#!/usr/bin/env bash
# Runs after every file edit. Reports build failures to Claude; does not modify files.

cd "$CLAUDE_PROJECT_DIR"

BUILD_OUTPUT=$(npm run build 2>&1)
BUILD_EXIT=$?

if [ $BUILD_EXIT -ne 0 ]; then
  echo "BUILD FAILED (exit $BUILD_EXIT) — fix before continuing:"
  echo ""
  echo "$BUILD_OUTPUT"
  exit 2
fi

exit 0
