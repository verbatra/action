#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/harness.sh"

stub_dir="$work_dir/stub"
output="$work_dir/output.txt"
write_exec_capturing_npm_stub "$stub_dir"
fixture_dir="$(fixture_path config-guard-present)"

run_with() {
  local sensitive="$1" capture="$2" locales="$3" command="${4:-check}" cli_version="${5:-0.12.0}"
  run_step "$output" \
    PATH="$stub_dir:$PATH" \
    EXEC_CAPTURE="$capture" \
    VERBATRA_VERSION="$cli_version" \
    COMMAND="$command" \
    WORKING_DIRECTORY="$fixture_dir" \
    SENSITIVE="$sensitive" \
    LOCALES="$locales"
}

if ! run_with "true" "$work_dir/sensitive.txt" ""; then
  fail "the guard rejected sensitive with command check and version 0.12.0"
  cat "$output"
elif ! grep -qx -- "--sensitive" "$work_dir/sensitive.txt"; then
  fail "sensitive: true did not pass --sensitive to the CLI"
fi

if ! run_with "false" "$work_dir/not-sensitive.txt" ""; then
  fail "the guard rejected sensitive: false"
  cat "$output"
elif grep -qx -- "--sensitive" "$work_dir/not-sensitive.txt"; then
  fail "sensitive: false still passed --sensitive to the CLI"
fi

if ! run_with "false" "$work_dir/locales.txt" "de,fr"; then
  fail "the guard rejected locales: de,fr with version 0.12.0"
  cat "$output"
elif ! grep -qx -- "--locales" "$work_dir/locales.txt" || ! grep -qx -- "de,fr" "$work_dir/locales.txt"; then
  fail "locales: de,fr did not pass --locales de,fr to the CLI as one argument"
fi

if ! run_with "false" "$work_dir/no-locales.txt" ""; then
  fail "the guard rejected an empty locales input"
  cat "$output"
elif grep -qx -- "--locales" "$work_dir/no-locales.txt"; then
  fail "an empty locales input still passed --locales to the CLI"
fi

if run_with "yes" "$work_dir/not-boolean.txt" ""; then
  fail "the guard accepted sensitive: yes"
elif ! grep -q 'the sensitive input must be "true" or "false"' "$output"; then
  fail "sensitive: yes was rejected, but not by the boolean guard"
fi

if run_with "true" "$work_dir/with-diff.txt" "" "diff"; then
  fail "the guard accepted sensitive together with command diff"
elif ! grep -q 'the sensitive input applies only to the check command' "$output"; then
  fail "sensitive with diff was rejected, but not by the sensitive command guard"
fi

if ! run_with "false" "$work_dir/old-cli-locales.txt" "de" "check" "0.11.1"; then
  fail "the guard rejected locales with version 0.11.1, whose CLI has --locales"
  cat "$output"
elif ! grep -qx -- "--locales" "$work_dir/old-cli-locales.txt"; then
  fail "locales with version 0.11.1 did not pass --locales to the CLI"
fi

for hostile in "de, fr" "de;fr" "de,,fr" ",de" "de,"; do
  if run_with "false" "$work_dir/hostile.txt" "$hostile"; then
    fail "the guard accepted the malformed locales input '$hostile'"
  elif ! grep -q 'the locales input must be a comma-separated list' "$output"; then
    fail "the malformed locales input '$hostile' was rejected, but not by the locales guard"
  fi
done

finish "sensitive maps to --sensitive exactly when true, and locales maps to one --locales argument and rejects malformed lists"
