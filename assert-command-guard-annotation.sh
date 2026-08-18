#!/usr/bin/env bash
set -euo pipefail

action_file="${1:-action.yml}"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

guard_script="$work_dir/guard.sh"
annotations="$work_dir/annotations.txt"
stub_dir="$work_dir/stub"

awk '
  /^      id: run$/ { in_step = 1 }
  in_step && /^      run: \|$/ { in_script = 1; next }
  in_script && /^        / { sub(/^        /, ""); print; next }
  in_script && /^[[:space:]]*$/ { print ""; next }
  in_script { exit }
' "$action_file" >"$guard_script"

if [ ! -s "$guard_script" ]; then
  echo "FAIL: could not extract the run step script from $action_file"
  exit 1
fi

mkdir -p "$stub_dir"
printf '#!/usr/bin/env bash\nexit 0\n' >"$stub_dir/npx"
chmod +x "$stub_dir/npx"

forged_command=$'check\n::stop-commands::forged'

if [ "$(printf '%s' "$forged_command" | wc -l | tr -d ' ')" != "1" ]; then
  echo "FAIL: the payload is not multi-line, so it cannot exercise the command-forging vector"
  exit 1
fi

status=0
env PATH="$stub_dir:$PATH" \
  VERBATRA_VERSION="0.9.3" \
  COMMAND="$forged_command" \
  CONFIG_PATH="" \
  WORKING_DIRECTORY="" \
  DRY_RUN="false" \
  SUMMARY_FILE="$work_dir/summary.json" \
  ERROR_FILE="$work_dir/error.txt" \
  GITHUB_OUTPUT="$work_dir/github-output.txt" \
  bash --noprofile --norc -eo pipefail "$guard_script" >"$annotations" 2>&1 || status=$?

failures=0

if [ "$status" -eq 0 ]; then
  echo "FAIL: the guard accepted a command input carrying a forged workflow command"
  failures=1
fi

if ! grep -q 'the command input must be one of' "$annotations"; then
  echo "FAIL: the annotation is not the command guard's, so an earlier guard now fires first and this harness no longer exercises the command guard"
  failures=1
fi

if grep -q 'forged' "$annotations"; then
  echo "FAIL: the guard annotation echoes the rejected command value, so a newline inside that value forges a second workflow command"
  failures=1
fi

command_count="$(awk '/^::/ { n++ } END { print n + 0 }' "$annotations")"
if [ "$command_count" != "1" ]; then
  echo "FAIL: the guard emitted $command_count workflow commands, expected exactly 1"
  failures=1
fi

if [ "$failures" -ne 0 ]; then
  echo "--- captured annotation output ---"
  cat "$annotations"
  exit 1
fi

echo "OK: the command guard rejected the forged input and its annotation omits the rejected value"
