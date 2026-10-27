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
  local sensitive="$1"
  local capture="$2"
  local locales="$3"
  local command="${4:-check}"
  local cli_version="${5:-0.12.0}"
  local status=0
  env PATH="$stub_dir:$PATH" \
    EXEC_CAPTURE="$capture" \
    GITHUB_ACTION_PATH="$repo_root" \
    VERBATRA_VERSION="$cli_version" \
    COMMAND="$command" \
    CONFIG_PATH="" \
    WORKING_DIRECTORY="$fixture_dir" \
    DRY_RUN="false" \
    QA="false" \
    QA_STRICT="false" \
    REQUIRE_REVIEWED="false" \
    SENSITIVE="$sensitive" \
    LOCALES="$locales" \
    SUMMARY_FILE="$work_dir/summary.json" \
    ERROR_FILE="$work_dir/error.txt" \
    LOCALE_FILES_FILE="$work_dir/locale-files.json" \
    GITHUB_OUTPUT="$work_dir/github-output.txt" \
    bash --noprofile --norc -eo pipefail "$guard_script" >"$work_dir/output.txt" 2>&1 || status=$?
  return "$status"
}

failures=0

if ! run_guard "true" "$work_dir/sensitive.txt" ""; then
  echo "FAIL: the guard rejected sensitive with command check and version 0.12.0"
  cat "$work_dir/output.txt"
  failures=1
elif ! grep -qx -- "--sensitive" "$work_dir/sensitive.txt"; then
  echo "FAIL: sensitive: true did not pass --sensitive to the CLI"
  failures=1
fi

if ! run_guard "false" "$work_dir/not-sensitive.txt" ""; then
  echo "FAIL: the guard rejected sensitive: false"
  cat "$work_dir/output.txt"
  failures=1
elif grep -qx -- "--sensitive" "$work_dir/not-sensitive.txt"; then
  echo "FAIL: sensitive: false still passed --sensitive to the CLI"
  failures=1
fi

if ! run_guard "false" "$work_dir/locales.txt" "de,fr"; then
  echo "FAIL: the guard rejected locales: de,fr with version 0.12.0"
  cat "$work_dir/output.txt"
  failures=1
elif ! grep -qx -- "--locales" "$work_dir/locales.txt" || ! grep -qx -- "de,fr" "$work_dir/locales.txt"; then
  echo "FAIL: locales: de,fr did not pass --locales de,fr to the CLI as one argument"
  failures=1
fi

if ! run_guard "false" "$work_dir/no-locales.txt" ""; then
  echo "FAIL: the guard rejected an empty locales input"
  cat "$work_dir/output.txt"
  failures=1
elif grep -qx -- "--locales" "$work_dir/no-locales.txt"; then
  echo "FAIL: an empty locales input still passed --locales to the CLI"
  failures=1
fi

if run_guard "yes" "$work_dir/not-boolean.txt" ""; then
  echo "FAIL: the guard accepted sensitive: yes"
  failures=1
elif ! grep -q 'the sensitive input must be "true" or "false"' "$work_dir/output.txt"; then
  echo "FAIL: sensitive: yes was rejected, but not by the boolean guard"
  failures=1
fi

if run_guard "true" "$work_dir/with-diff.txt" "" "diff"; then
  echo "FAIL: the guard accepted sensitive together with command diff"
  failures=1
elif ! grep -q 'the sensitive input applies only to the check command' "$work_dir/output.txt"; then
  echo "FAIL: sensitive with diff was rejected, but not by the sensitive command guard"
  failures=1
fi

if run_guard "true" "$work_dir/below.txt" "" "check" "0.11.1"; then
  echo "FAIL: the guard accepted sensitive with version 0.11.1"
  failures=1
elif ! grep -q 'the sensitive input needs version' "$work_dir/output.txt"; then
  echo "FAIL: sensitive with version 0.11.1 was rejected, but not by the sensitive version guard"
  failures=1
fi

for hostile in "de, fr" "de;fr" "de,,fr" ",de" "de,"; do
  if run_guard "false" "$work_dir/hostile.txt" "$hostile"; then
    echo "FAIL: the guard accepted the malformed locales input '$hostile'"
    failures=1
  elif ! grep -q 'the locales input must be a comma-separated list' "$work_dir/output.txt"; then
    echo "FAIL: the malformed locales input '$hostile' was rejected, but not by the locales guard"
    failures=1
  fi
done

if [ "$failures" -ne 0 ]; then
  exit 1
fi

echo "OK: sensitive maps to --sensitive exactly when true, and locales maps to one --locales argument and rejects malformed lists"
