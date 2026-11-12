#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/harness.sh"

stub_dir="$work_dir/stub"
output="$work_dir/output.txt"
write_exec_capturing_npm_stub "$stub_dir"
fixture_dir="$(fixture_path config-guard-present)"

run_with_require_reviewed() {
  run_step "$output" \
    PATH="$stub_dir:$PATH" \
    EXEC_CAPTURE="$2" \
    VERBATRA_VERSION="0.12.0" \
    COMMAND="check" \
    WORKING_DIRECTORY="$fixture_dir" \
    REQUIRE_REVIEWED="$1"
}

if ! run_with_require_reviewed "true" "$work_dir/with.txt"; then
  fail "the guard rejected require-reviewed with command check and version 0.12.0"
  cat "$output"
elif ! grep -qx -- "--require-reviewed" "$work_dir/with.txt"; then
  fail "require-reviewed: true did not pass --require-reviewed to the CLI"
fi

if ! run_with_require_reviewed "false" "$work_dir/without.txt"; then
  fail "the guard rejected require-reviewed: false"
  cat "$output"
elif grep -qx -- "--require-reviewed" "$work_dir/without.txt"; then
  fail "require-reviewed: false still passed --require-reviewed to the CLI"
fi

finish "require-reviewed maps to --require-reviewed exactly when it is true"
