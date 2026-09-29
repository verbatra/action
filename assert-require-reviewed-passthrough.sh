#!/usr/bin/env bash
set -euo pipefail

action_file="${1:-action.yml}"
repo_root="$(cd "$(dirname "$action_file")" && pwd)"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

guard_script="$work_dir/guard.sh"
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
cat >"$stub_dir/npm" <<'STUB'
#!/usr/bin/env bash
if [ "$1" = "exec" ]; then
  shift
  printf '%s\n' "$@" >"$EXEC_CAPTURE"
fi
exit 0
STUB
chmod +x "$stub_dir/npm"

fixture_dir="$(cd "$repo_root/.github/fixtures/config-guard-present" && pwd)"

run_guard() {
  local require_reviewed="$1"
  local capture="$2"
  local status=0
  env PATH="$stub_dir:$PATH" \
    EXEC_CAPTURE="$capture" \
    GITHUB_ACTION_PATH="$repo_root" \
    VERBATRA_VERSION="0.12.0" \
    COMMAND="check" \
    CONFIG_PATH="" \
    WORKING_DIRECTORY="$fixture_dir" \
    DRY_RUN="false" \
    QA="false" \
    QA_STRICT="false" \
    REQUIRE_REVIEWED="$require_reviewed" \
    SUMMARY_FILE="$work_dir/summary.json" \
    ERROR_FILE="$work_dir/error.txt" \
    GITHUB_OUTPUT="$work_dir/github-output.txt" \
    bash --noprofile --norc -eo pipefail "$guard_script" >"$work_dir/output.txt" 2>&1 || status=$?
  return "$status"
}

failures=0

if ! run_guard "true" "$work_dir/with.txt"; then
  echo "FAIL: the guard rejected require-reviewed with command check and version 0.12.0"
  cat "$work_dir/output.txt"
  failures=1
elif ! grep -qx -- "--require-reviewed" "$work_dir/with.txt"; then
  echo "FAIL: require-reviewed: true did not pass --require-reviewed to the CLI"
  failures=1
fi

if ! run_guard "false" "$work_dir/without.txt"; then
  echo "FAIL: the guard rejected require-reviewed: false"
  cat "$work_dir/output.txt"
  failures=1
elif grep -qx -- "--require-reviewed" "$work_dir/without.txt"; then
  echo "FAIL: require-reviewed: false still passed --require-reviewed to the CLI"
  failures=1
fi

if [ "$failures" -ne 0 ]; then
  exit 1
fi

echo "OK: require-reviewed maps to --require-reviewed exactly when it is true"
