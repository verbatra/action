#!/usr/bin/env bash
set -euo pipefail

action_file="${1:-action.yml}"
repo_root="$(cd "$(dirname "$action_file")" && pwd)"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

guard_script="$work_dir/guard.sh"
stub_action_dir="$work_dir/stub-action"
stub_bin_dir="$work_dir/stub-bin"
output="$work_dir/output.txt"
error_file="$work_dir/error.txt"
install_marker="$work_dir/install-invoked"
stub_marker="$work_dir/resolve-config-stub-invoked"
github_output="$work_dir/github-output.txt"

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

mkdir -p "$stub_action_dir" "$stub_bin_dir"

# Stub resolve-config.mjs to always fail with its own stderr, simulating an
# unanticipated exception independent of resolve-config.mjs's own try/catch,
# and assert the guard's ERROR_FILE redirect never lets that content survive.
leak_marker="STUB-RESOLVE-CONFIG-STDERR-LEAK-$$"
cat >"$stub_action_dir/resolve-config.mjs" <<STUB
#!/usr/bin/env node
import { writeFileSync } from "node:fs";
writeFileSync("$stub_marker", "invoked\n");
process.stderr.write("$leak_marker: pretend uncaught exception with a resolved path embedded\n");
process.exit(1);
STUB

cat >"$stub_bin_dir/npm" <<STUB
#!/usr/bin/env bash
if [ "\$1" = "install" ]; then
  touch "$install_marker"
  exit 0
fi
exit 0
STUB
chmod +x "$stub_bin_dir/npm"

working_dir="$(cd "$repo_root/.github/fixtures/config-guard-present" && pwd)"

status=0
env PATH="$stub_bin_dir:$PATH" \
  GITHUB_ACTION_PATH="$stub_action_dir" \
  VERBATRA_VERSION="0.9.3" \
  COMMAND="check" \
  CONFIG_PATH="" \
  WORKING_DIRECTORY="$working_dir" \
  DRY_RUN="false" \
  SUMMARY_FILE="$work_dir/summary.json" \
  ERROR_FILE="$error_file" \
  GITHUB_OUTPUT="$github_output" \
  bash --noprofile --norc -eo pipefail "$guard_script" >"$output" 2>&1 || status=$?

failures=0

if [ "$status" -ne 0 ]; then
  echo "FAIL: the guard script exited $status instead of 0 when resolve-config.mjs fails"
  failures=1
fi

exit_code="$(grep '^exit_code=' "$github_output" | tail -1 | cut -d= -f2 || true)"
if [ "$exit_code" != "1" ]; then
  echo "FAIL: exit_code output was '$exit_code', expected 1 when resolve-config.mjs exits nonzero"
  failures=1
fi

if [ -f "$install_marker" ]; then
  echo "FAIL: npm install was invoked even though resolve-config.mjs failed; the guard must fail before install"
  failures=1
fi

if ! grep -qF "no recognized verbatra config file was found directly inside" "$error_file"; then
  echo "FAIL: ERROR_FILE does not contain the fixed fail_before_install message"
  failures=1
fi

if [ ! -f "$stub_marker" ]; then
  echo "FAIL: the resolve-config.mjs stub was never invoked; the stderr assertions below prove nothing"
  failures=1
fi

if grep -qF "$leak_marker" "$error_file"; then
  echo "FAIL: ERROR_FILE still contains resolve-config.mjs's raw stderr; the fail_before_install overwrite did not happen"
  failures=1
fi

if grep -qF "$leak_marker" "$output"; then
  echo "FAIL: resolve-config.mjs's raw stderr reached the step's own log stream; the 2>\"\$ERROR_FILE\" redirect at the call site is missing"
  failures=1
fi

if [ "$failures" -ne 0 ]; then
  echo "--- guard script output ---"
  cat "$output"
  echo "--- ERROR_FILE ---"
  cat "$error_file" 2>/dev/null || echo "(no error file)"
  exit 1
fi

echo "OK: a resolve-config.mjs failure's raw stderr never reaches the step log or survives in ERROR_FILE; only the fixed fail_before_install message does"
