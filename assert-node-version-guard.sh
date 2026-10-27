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
real_node="$(command -v node)"
cat >"$stub_dir/node" <<STUB
#!/usr/bin/env bash
if [ "\$1" = "-p" ]; then
  printf '%s\n' "\$STUB_NODE_VERSION"
  exit 0
fi
exec "$real_node" "\$@"
STUB
cat >"$stub_dir/npm" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
chmod +x "$stub_dir/node" "$stub_dir/npm"

fixture_dir="$(cd "$repo_root/.github/fixtures/config-guard-present" && pwd)"

run_guard() {
  local node_version="$1"
  local status=0
  env PATH="$stub_dir:$PATH" \
    STUB_NODE_VERSION="$node_version" \
    GITHUB_ACTION_PATH="$repo_root" \
    VERBATRA_VERSION="0.12.0" \
    COMMAND="check" \
    CONFIG_PATH="" \
    WORKING_DIRECTORY="$fixture_dir" \
    DRY_RUN="false" \
    QA="false" \
    QA_STRICT="false" \
    REQUIRE_REVIEWED="false" \
    SENSITIVE="false" \
    SENSITIVE="false" \
    SUMMARY_FILE="$work_dir/summary.json" \
    ERROR_FILE="$work_dir/error.txt" \
    LOCALE_FILES_FILE="$work_dir/locale-files.json" \
    GITHUB_OUTPUT="$work_dir/github-output.txt" \
    bash --noprofile --norc -eo pipefail "$guard_script" >"$work_dir/output.txt" 2>&1 || status=$?
  return "$status"
}

failures=0

for accepted in 22.18.0 22.21.1 24.0.0 24.21.0 25.1.0; do
  if ! run_guard "$accepted"; then
    echo "FAIL: the guard rejected Node.js $accepted, which the CLI supports"
    cat "$work_dir/output.txt"
    failures=1
  fi
done

for rejected in 20.19.0 21.7.3 22.17.9 23.11.0; do
  if run_guard "$rejected"; then
    echo "FAIL: the guard accepted Node.js $rejected, which is outside the CLI's supported range"
    failures=1
  elif ! grep -q 'the node-version input resolved to' "$work_dir/output.txt"; then
    echo "FAIL: Node.js $rejected was rejected, but not by the node-version guard"
    cat "$work_dir/output.txt"
    failures=1
  fi
done

if [ "$failures" -ne 0 ]; then
  exit 1
fi

echo "OK: the node-version guard accepts 22.18.0 and newer on the 22 line and 24 or newer, and rejects everything else"
