#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=SCRIPTDIR/harness.sh
source "$(dirname "$0")/harness.sh"

stub_action_dir="$work_dir/stub-action"
stub_bin_dir="$work_dir/stub-bin"
output="$work_dir/output.txt"
error_file="$work_dir/error.txt"
install_marker="$work_dir/install-invoked"
stub_marker="$work_dir/resolve-config-stub-invoked"
github_output="$work_dir/github-output.txt"
leak_marker="STUB-RESOLVE-CONFIG-STDERR-LEAK-$$"

mkdir -p "$stub_action_dir/src"
cat >"$stub_action_dir/src/resolve-config.mjs" <<STUB
#!/usr/bin/env node
import { writeFileSync } from "node:fs";
writeFileSync("$stub_marker", "invoked\n");
process.stderr.write("$leak_marker: pretend uncaught exception with a resolved path embedded\n");
process.exit(1);
STUB
write_exec_capturing_npm_stub "$stub_bin_dir"

status=0
run_step "$output" \
  PATH="$stub_bin_dir:$PATH" \
  INSTALL_MARKER="$install_marker" \
  GITHUB_ACTION_PATH="$stub_action_dir" \
  COMMAND="check" \
  WORKING_DIRECTORY="$(fixture_path config-guard-present)" \
  ERROR_FILE="$error_file" \
  GITHUB_OUTPUT="$github_output" || status=$?

if [ "$status" -ne 0 ]; then
  fail "the run step exited $status instead of 0 when resolve-config.mjs fails"
fi

exit_code="$(github_output_value exit_code "$github_output")"
if [ "$exit_code" != "1" ]; then
  fail "exit_code output was '$exit_code', expected 1 when resolve-config.mjs exits nonzero"
fi

if [ -f "$install_marker" ]; then
  fail "npm install was invoked even though resolve-config.mjs failed; the guard must fail before install"
fi

if ! grep -qF "no recognized verbatra config file was found directly inside" "$error_file"; then
  fail "ERROR_FILE does not contain the fixed fail_before_install message"
fi

if [ ! -f "$stub_marker" ]; then
  fail "the resolve-config.mjs stub was never invoked; the stderr assertions below prove nothing"
fi

if grep -qF "$leak_marker" "$error_file"; then
  fail "ERROR_FILE still contains resolve-config.mjs's raw stderr; the fail_before_install overwrite did not happen"
fi

if grep -qF "$leak_marker" "$output"; then
  fail "resolve-config.mjs's raw stderr reached the step's own log stream; the 2>\"\$ERROR_FILE\" redirect at the call site is missing"
fi

if [ "$failures" -ne 0 ]; then
  echo "--- run step output ---"
  cat "$output"
  echo "--- ERROR_FILE ---"
  cat "$error_file" 2>/dev/null || echo "(no error file)"
fi

finish "a resolve-config.mjs failure's raw stderr never reaches the step log or survives in ERROR_FILE; only the fixed fail_before_install message does"
