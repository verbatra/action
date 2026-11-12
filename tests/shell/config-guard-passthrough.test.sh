#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/harness.sh"

output="$work_dir/output.txt"
stub_dir="$work_dir/stub"
exec_capture="$work_dir/exec-args.txt"
write_exec_capturing_npm_stub "$stub_dir"

fixture_dir="$(fixture_path config-guard-present)"
expected_config="$fixture_dir/.verbatrarc.json"

status=0
run_step "$output" \
  PATH="$stub_dir:$PATH" \
  EXEC_CAPTURE="$exec_capture" \
  COMMAND="check" \
  WORKING_DIRECTORY="$fixture_dir" || status=$?

if [ "$status" -ne 0 ]; then
  fail "the run step exited $status instead of 0"
fi

if [ -s "$work_dir/error.txt" ]; then
  fail "ERROR_FILE is not empty after a quiet stubbed npm install"
fi

if [ ! -f "$exec_capture" ]; then
  fail "the npm stub's exec branch was never invoked; the guard did not reach the CLI invocation"
elif ! captured_pair_present "--config" "$expected_config" "$exec_capture"; then
  fail "--config is not immediately followed by the resolved config path '$expected_config' in the captured exec arguments"
fi

if [ "$failures" -ne 0 ]; then
  echo "--- run step output ---"
  cat "$output"
  echo "--- captured exec arguments ---"
  cat "$exec_capture" 2>/dev/null || echo "(no capture file)"
fi

finish "the guard resolved config-guard-present's matched config file and passed it to the CLI via --config"
