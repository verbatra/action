#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/harness.sh"

run_output="$work_dir/run-output.txt"
summary_file="$work_dir/summary.json"
error_file="$work_dir/error.txt"
github_output="$work_dir/github-output.txt"
step_summary_file="$work_dir/step-summary.md"
annotations="$work_dir/annotations.txt"
annotate_stderr="$work_dir/annotate-stderr.txt"

forged_config_path=$'valid-looking/path\n::stop-commands::forged'

if [ "$(printf '%s' "$forged_config_path" | wc -l | tr -d ' ')" != "1" ]; then
  echo "FAIL: the payload is not multi-line, so it cannot exercise the config-path injection vector"
  exit 1
fi

status=0
run_step "$run_output" \
  COMMAND="check" \
  CONFIG_PATH="$forged_config_path" \
  WORKING_DIRECTORY="$(fixture_path config-guard-present)" \
  SUMMARY_FILE="$summary_file" \
  ERROR_FILE="$error_file" \
  GITHUB_OUTPUT="$github_output" || status=$?

if [ "$status" -ne 0 ]; then
  fail "the run step exited $status instead of 0; the config-path branch must fail through exit_code, not the script's own exit status"
fi

exit_code_output="$(github_output_value exit_code "$github_output")"
if [ "$exit_code_output" != "1" ]; then
  fail "exit_code output was '$exit_code_output', expected 1"
fi

command_output="$(github_output_value command "$github_output")"

annotate_status=0
env GITHUB_STEP_SUMMARY="$step_summary_file" \
  node "$repo_root/src/annotate.mjs" "$summary_file" "$error_file" "$exit_code_output" "$command_output" \
  >"$annotations" 2>"$annotate_stderr" || annotate_status=$?

if [ "$annotate_status" -eq 0 ]; then
  fail "annotate.mjs exited 0 for a failed run; expected a nonzero exit"
fi

command_count="$(awk '/^::/ { n++ } END { print n + 0 }' "$annotations")"
if [ "$command_count" != "1" ]; then
  fail "annotate.mjs emitted $command_count workflow commands, expected exactly 1"
fi

physical_lines="$(wc -l <"$annotations" | tr -d ' ')"
if [ "$physical_lines" != "1" ]; then
  fail "annotate.mjs's stdout spans $physical_lines physical lines, expected exactly 1; the injected newline leaked as a literal line break instead of being escaped"
fi

if ! grep -qF '%0A' "$annotations"; then
  fail "the injected newline was not escaped to %0A anywhere in annotate.mjs's output"
fi

if [ "$failures" -ne 0 ]; then
  echo "--- run step output ---"
  cat "$run_output"
  echo "--- ERROR_FILE ---"
  cat "$error_file"
  echo "--- annotate.mjs stdout ---"
  cat "$annotations"
  echo "--- annotate.mjs stderr ---"
  cat "$annotate_stderr"
fi

finish "the config-path guard's failure is escaped through annotate.mjs, with the injected newline rendered as %0A and exactly one workflow command"
