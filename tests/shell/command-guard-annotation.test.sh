#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/harness.sh"

annotations="$work_dir/annotations.txt"
forged_command=$'check\n::stop-commands::forged'

if [ "$(printf '%s' "$forged_command" | wc -l | tr -d ' ')" != "1" ]; then
  echo "FAIL: the payload is not multi-line, so it cannot exercise the command-forging vector"
  exit 1
fi

if run_step "$annotations" COMMAND="$forged_command"; then
  fail "the guard accepted a command input carrying a forged workflow command"
fi

if ! grep -q 'the command input must be one of' "$annotations"; then
  fail "the annotation is not the command guard's, so an earlier guard now fires first and this harness no longer exercises the command guard"
fi

if grep -q 'forged' "$annotations"; then
  fail "the guard annotation echoes the rejected command value, so a newline inside that value forges a second workflow command"
fi

command_count="$(awk '/^::/ { n++ } END { print n + 0 }' "$annotations")"
if [ "$command_count" != "1" ]; then
  fail "the guard emitted $command_count workflow commands, expected exactly 1"
fi

if [ "$failures" -ne 0 ]; then
  echo "--- captured annotation output ---"
  cat "$annotations"
fi

finish "the command guard rejected the forged input and its annotation omits the rejected value"
