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

failures=0

# Stub npm so "install" leaves a marker file (proving it ran) and "exec"
# captures its arguments, mirroring assert-config-guard-passthrough.sh.
make_npm_stub() {
  local install_marker="$1"
  mkdir -p "$stub_dir"
  cat >"$stub_dir/npm" <<STUB
#!/usr/bin/env bash
if [ "\$1" = "install" ]; then
  touch "$install_marker"
  exit 0
fi
if [ "\$1" = "exec" ]; then
  shift
  printf '%s\n' "\$@" >"$work_dir/exec-args.txt"
  exit 0
fi
exit 0
STUB
  chmod +x "$stub_dir/npm"
}

config_fixture_dir="$(cd "$repo_root/.github/fixtures/config-guard-present" && pwd)"
absolute_config_path="$config_fixture_dir/.verbatrarc.json"

# Positive case: an absolute config-path pointing outside working-directory
# is used as-is, not re-resolved against working-directory.
other_working_dir="$(cd "$repo_root/.github/fixtures/config-guard-not-inherited/child" && pwd)"
positive_install_marker="$work_dir/positive-install-invoked"
positive_output="$work_dir/positive-output.txt"
positive_error="$work_dir/positive-error.txt"
positive_github_output="$work_dir/positive-github-output.txt"

rm -f "$work_dir/exec-args.txt"
make_npm_stub "$positive_install_marker"

positive_status=0
env PATH="$stub_dir:$PATH" \
  GITHUB_ACTION_PATH="$repo_root" \
  VERBATRA_VERSION="0.9.3" \
  COMMAND="check" \
  CONFIG_PATH="$absolute_config_path" \
  WORKING_DIRECTORY="$other_working_dir" \
  DRY_RUN="false" \
  SUMMARY_FILE="$work_dir/positive-summary.json" \
  ERROR_FILE="$positive_error" \
  GITHUB_OUTPUT="$positive_github_output" \
  bash --noprofile --norc -eo pipefail "$guard_script" >"$positive_output" 2>&1 || positive_status=$?

if [ "$positive_status" -ne 0 ]; then
  echo "FAIL: the guard script exited $positive_status instead of 0 for a valid absolute config-path"
  failures=1
fi

if [ ! -f "$positive_install_marker" ]; then
  echo "FAIL: npm install was never invoked; the guard did not accept the absolute config-path"
  failures=1
fi

if [ ! -f "$work_dir/exec-args.txt" ]; then
  echo "FAIL: the npm stub's exec branch was never invoked; the guard did not reach the CLI invocation"
  failures=1
else
  found_pair=0
  previous_line=""
  while IFS= read -r line; do
    if [ "$previous_line" = "--config" ] && [ "$line" = "$absolute_config_path" ]; then
      found_pair=1
    fi
    previous_line="$line"
  done <"$work_dir/exec-args.txt"
  if [ "$found_pair" -ne 1 ]; then
    echo "FAIL: --config is not immediately followed by the unmodified absolute path '$absolute_config_path'; it may have been re-resolved against working-directory"
    failures=1
  fi
fi

# Negative case: a nonexistent absolute config-path fails before npm install,
# and the error names the absolute path unchanged (not joined with working-directory).
nonexistent_absolute_path="$config_fixture_dir/does-not-exist.json"
negative_install_marker="$work_dir/negative-install-invoked"
negative_output="$work_dir/negative-output.txt"
negative_error="$work_dir/negative-error.txt"
negative_github_output="$work_dir/negative-github-output.txt"

rm -f "$work_dir/exec-args.txt"
make_npm_stub "$negative_install_marker"

negative_status=0
env PATH="$stub_dir:$PATH" \
  GITHUB_ACTION_PATH="$repo_root" \
  VERBATRA_VERSION="0.9.3" \
  COMMAND="check" \
  CONFIG_PATH="$nonexistent_absolute_path" \
  WORKING_DIRECTORY="$config_fixture_dir" \
  DRY_RUN="false" \
  SUMMARY_FILE="$work_dir/negative-summary.json" \
  ERROR_FILE="$negative_error" \
  GITHUB_OUTPUT="$negative_github_output" \
  bash --noprofile --norc -eo pipefail "$guard_script" >"$negative_output" 2>&1 || negative_status=$?

if [ "$negative_status" -ne 0 ]; then
  echo "FAIL: the guard script exited $negative_status instead of 0; a nonexistent config-path must fail through exit_code, not the script's own exit status"
  failures=1
fi

negative_exit_code="$(grep '^exit_code=' "$negative_github_output" | tail -1 | cut -d= -f2 || true)"
if [ "$negative_exit_code" != "1" ]; then
  echo "FAIL: exit_code output was '$negative_exit_code', expected 1 for a nonexistent absolute config-path"
  failures=1
fi

if [ -f "$negative_install_marker" ]; then
  echo "FAIL: npm install was invoked for a nonexistent absolute config-path; the guard must fail before install"
  failures=1
fi

if ! grep -qF "$nonexistent_absolute_path" "$negative_error"; then
  echo "FAIL: ERROR_FILE does not name the unmodified nonexistent absolute path '$nonexistent_absolute_path'"
  failures=1
fi

if [ "$failures" -ne 0 ]; then
  echo "--- positive case output ---"
  cat "$positive_output"
  echo "--- negative case output ---"
  cat "$negative_output"
  echo "--- negative case ERROR_FILE ---"
  cat "$negative_error" 2>/dev/null || echo "(no error file)"
  exit 1
fi

echo "OK: an absolute config-path is used as-is, both for a valid file outside working-directory and for a nonexistent one"
