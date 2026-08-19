#!/usr/bin/env bash
set -euo pipefail

action_file="${1:-action.yml}"
repo_root="$(cd "$(dirname "$action_file")" && pwd)"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

guard_script="$work_dir/guard.sh"
output="$work_dir/output.txt"
stub_dir="$work_dir/stub"
exec_capture="$work_dir/exec-args.txt"

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
cat >"$stub_dir/npm" <<STUB
#!/usr/bin/env bash
if [ "\$1" = "install" ]; then
  exit 0
fi
if [ "\$1" = "exec" ]; then
  shift
  printf '%s\n' "\$@" >"$exec_capture"
  exit 0
fi
exit 0
STUB
chmod +x "$stub_dir/npm"

fixture_dir="$(cd "$repo_root/.github/fixtures/config-guard-present" && pwd)"
expected_config="$fixture_dir/.verbatrarc.json"

status=0
env PATH="$stub_dir:$PATH" \
  GITHUB_ACTION_PATH="$repo_root" \
  VERBATRA_VERSION="0.9.3" \
  COMMAND="check" \
  CONFIG_PATH="" \
  WORKING_DIRECTORY="$fixture_dir" \
  DRY_RUN="false" \
  SUMMARY_FILE="$work_dir/summary.json" \
  ERROR_FILE="$work_dir/error.txt" \
  GITHUB_OUTPUT="$work_dir/github-output.txt" \
  bash --noprofile --norc -eo pipefail "$guard_script" >"$output" 2>&1 || status=$?

failures=0

if [ "$status" -ne 0 ]; then
  echo "FAIL: the guard script exited $status instead of 0"
  failures=1
fi

if [ -s "$work_dir/error.txt" ]; then
  echo "FAIL: ERROR_FILE is not empty after a quiet stubbed npm install"
  failures=1
fi

if [ ! -f "$exec_capture" ]; then
  echo "FAIL: the npm stub's exec branch was never invoked; the guard did not reach the CLI invocation"
  failures=1
else
  found_pair=0
  previous_line=""
  while IFS= read -r line; do
    if [ "$previous_line" = "--config" ] && [ "$line" = "$expected_config" ]; then
      found_pair=1
    fi
    previous_line="$line"
  done <"$exec_capture"
  if [ "$found_pair" -ne 1 ]; then
    echo "FAIL: --config is not immediately followed by the resolved config path '$expected_config' in the captured exec arguments"
    failures=1
  fi
fi

if [ "$failures" -ne 0 ]; then
  echo "--- guard script output ---"
  cat "$output"
  echo "--- captured exec arguments ---"
  cat "$exec_capture" 2>/dev/null || echo "(no capture file)"
  exit 1
fi

echo "OK: the guard resolved config-guard-present's matched config file and passed it to the CLI via --config"
