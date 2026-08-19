#!/usr/bin/env bash
set -euo pipefail

action_file="${1:-action.yml}"
repo_root="$(cd "$(dirname "$action_file")" && pwd)"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

guard_script="$work_dir/guard.sh"
stage1_output="$work_dir/stage1-output.txt"
summary_file="$work_dir/summary.json"
error_file="$work_dir/error.txt"
github_output="$work_dir/github-output.txt"
stage2_summary_file="$work_dir/step-summary.md"
annotations="$work_dir/annotations.txt"
annotate_stderr="$work_dir/annotate-stderr.txt"

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

forged_config_path=$'valid-looking/path\n::stop-commands::forged'

if [ "$(printf '%s' "$forged_config_path" | wc -l | tr -d ' ')" != "1" ]; then
  echo "FAIL: the payload is not multi-line, so it cannot exercise the config-path injection vector"
  exit 1
fi

working_directory="$repo_root/.github/fixtures/config-guard-present"

status=0
env VERBATRA_VERSION="0.9.3" \
  COMMAND="check" \
  CONFIG_PATH="$forged_config_path" \
  WORKING_DIRECTORY="$working_directory" \
  DRY_RUN="false" \
  SUMMARY_FILE="$summary_file" \
  ERROR_FILE="$error_file" \
  GITHUB_OUTPUT="$github_output" \
  bash --noprofile --norc -eo pipefail "$guard_script" >"$stage1_output" 2>&1 || status=$?

failures=0

if [ "$status" -ne 0 ]; then
  echo "FAIL: stage 1 (the run step script) exited $status instead of 0; the config-path branch must fail through exit_code, not the script's own exit status"
  failures=1
fi

exit_code_output="$(grep '^exit_code=' "$github_output" | tail -1 | cut -d= -f2 || true)"
if [ "$exit_code_output" != "1" ]; then
  echo "FAIL: exit_code output was '$exit_code_output', expected 1"
  failures=1
fi

command_output="$(grep '^command=' "$github_output" | tail -1 | cut -d= -f2- || true)"

status2=0
env GITHUB_STEP_SUMMARY="$stage2_summary_file" \
  node "$repo_root/annotate.mjs" "$summary_file" "$error_file" "$exit_code_output" "$command_output" \
  >"$annotations" 2>"$annotate_stderr" || status2=$?

if [ "$status2" -eq 0 ]; then
  echo "FAIL: annotate.mjs exited 0 for a failed run; expected a nonzero exit"
  failures=1
fi

command_count="$(awk '/^::/ { n++ } END { print n + 0 }' "$annotations")"
if [ "$command_count" != "1" ]; then
  echo "FAIL: annotate.mjs emitted $command_count workflow commands, expected exactly 1"
  failures=1
fi

physical_lines="$(wc -l <"$annotations" | tr -d ' ')"
if [ "$physical_lines" != "1" ]; then
  echo "FAIL: annotate.mjs's stdout spans $physical_lines physical lines, expected exactly 1; the injected newline leaked as a literal line break instead of being escaped"
  failures=1
fi

if ! grep -qF '%0A' "$annotations"; then
  echo "FAIL: the injected newline was not escaped to %0A anywhere in annotate.mjs's output"
  failures=1
fi

if [ "$failures" -ne 0 ]; then
  echo "--- stage 1 output ---"
  cat "$stage1_output"
  echo "--- ERROR_FILE ---"
  cat "$error_file"
  echo "--- annotate.mjs stdout ---"
  cat "$annotations"
  echo "--- annotate.mjs stderr ---"
  cat "$annotate_stderr"
  exit 1
fi

echo "OK: the config-path guard's failure is escaped through annotate.mjs, with the injected newline rendered as %0A and exactly one workflow command"
