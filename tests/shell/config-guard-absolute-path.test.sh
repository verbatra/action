#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=SCRIPTDIR/harness.sh
source "$(dirname "$0")/harness.sh"

stub_dir="$work_dir/stub"
exec_capture="$work_dir/exec-args.txt"
write_exec_capturing_npm_stub "$stub_dir"

config_fixture_dir="$(fixture_path config-guard-present)"
absolute_config_path="$config_fixture_dir/.verbatrarc.json"
other_working_dir="$(fixture_path config-guard-not-inherited/child)"

positive_install_marker="$work_dir/positive-install-invoked"
positive_output="$work_dir/positive-output.txt"

positive_status=0
run_step "$positive_output" \
  PATH="$stub_dir:$PATH" \
  INSTALL_MARKER="$positive_install_marker" \
  EXEC_CAPTURE="$exec_capture" \
  COMMAND="check" \
  CONFIG_PATH="$absolute_config_path" \
  WORKING_DIRECTORY="$other_working_dir" \
  ERROR_FILE="$work_dir/positive-error.txt" \
  GITHUB_OUTPUT="$work_dir/positive-github-output.txt" || positive_status=$?

if [ "$positive_status" -ne 0 ]; then
  fail "the run step exited $positive_status instead of 0 for a valid absolute config-path"
fi

if [ ! -f "$positive_install_marker" ]; then
  fail "npm install was never invoked; the guard did not accept the absolute config-path"
fi

if [ ! -f "$exec_capture" ]; then
  fail "the npm stub's exec branch was never invoked; the guard did not reach the CLI invocation"
elif ! captured_pair_present "--config" "$absolute_config_path" "$exec_capture"; then
  fail "--config is not immediately followed by the unmodified absolute path '$absolute_config_path'; it may have been re-resolved against working-directory"
fi

nonexistent_absolute_path="$config_fixture_dir/does-not-exist.json"
negative_install_marker="$work_dir/negative-install-invoked"
negative_output="$work_dir/negative-output.txt"
negative_error="$work_dir/negative-error.txt"
negative_github_output="$work_dir/negative-github-output.txt"

rm -f "$exec_capture"
negative_status=0
run_step "$negative_output" \
  PATH="$stub_dir:$PATH" \
  INSTALL_MARKER="$negative_install_marker" \
  EXEC_CAPTURE="$exec_capture" \
  COMMAND="check" \
  CONFIG_PATH="$nonexistent_absolute_path" \
  WORKING_DIRECTORY="$config_fixture_dir" \
  ERROR_FILE="$negative_error" \
  GITHUB_OUTPUT="$negative_github_output" || negative_status=$?

if [ "$negative_status" -ne 0 ]; then
  fail "the run step exited $negative_status instead of 0; a nonexistent config-path must fail through exit_code, not the script's own exit status"
fi

negative_exit_code="$(github_output_value exit_code "$negative_github_output")"
if [ "$negative_exit_code" != "1" ]; then
  fail "exit_code output was '$negative_exit_code', expected 1 for a nonexistent absolute config-path"
fi

if [ -f "$negative_install_marker" ]; then
  fail "npm install was invoked for a nonexistent absolute config-path; the guard must fail before install"
fi

if ! grep -qF "$nonexistent_absolute_path" "$negative_error"; then
  fail "ERROR_FILE does not name the unmodified nonexistent absolute path '$nonexistent_absolute_path'"
fi

if [ "$failures" -ne 0 ]; then
  echo "--- positive case output ---"
  cat "$positive_output"
  echo "--- negative case output ---"
  cat "$negative_output"
  echo "--- negative case ERROR_FILE ---"
  cat "$negative_error" 2>/dev/null || echo "(no error file)"
fi

finish "an absolute config-path is used as-is, both for a valid file outside working-directory and for a nonexistent one"
