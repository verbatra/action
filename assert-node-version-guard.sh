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
  local cli_version="$2"
  local status=0
  env PATH="$stub_dir:$PATH" \
    STUB_NODE_VERSION="$node_version" \
    GITHUB_ACTION_PATH="$repo_root" \
    VERBATRA_VERSION="$cli_version" \
    COMMAND="check" \
    CONFIG_PATH="" \
    WORKING_DIRECTORY="$fixture_dir" \
    DRY_RUN="false" \
    QA="false" \
    QA_STRICT="false" \
    REQUIRE_REVIEWED="false" \
    SENSITIVE="false" \
    LOCALES="" \
    SUMMARY_FILE="$work_dir/summary.json" \
    ERROR_FILE="$work_dir/error.txt" \
    LOCALE_FILES_FILE="$work_dir/locale-files.json" \
    GITHUB_OUTPUT="$work_dir/github-output.txt" \
    bash --noprofile --norc -eo pipefail "$guard_script" >"$work_dir/output.txt" 2>&1 || status=$?
  return "$status"
}

failures=0

expect_guard() {
  local verdict="$1" cli_version="$2" node_version="$3"
  if run_guard "$node_version" "$cli_version"; then
    if [ "$verdict" = "reject" ]; then
      echo "FAIL: CLI $cli_version with Node.js $node_version was accepted, but is outside the supported range"
      failures=1
    fi
  elif [ "$verdict" = "accept" ]; then
    echo "FAIL: CLI $cli_version with Node.js $node_version was rejected, but is supported"
    cat "$work_dir/output.txt"
    failures=1
  elif ! grep -q 'the node-version input resolved to' "$work_dir/output.txt"; then
    echo "FAIL: CLI $cli_version with Node.js $node_version was rejected, but not by the node-version guard"
    cat "$work_dir/output.txt"
    failures=1
  fi
}

for cli_version in 0.12.0 0.12.0-next.0 0.12.3 1.0.0; do
  for node_version in 22.18.0 22.21.1 24.0.0 24.21.0 25.1.0; do
    expect_guard accept "$cli_version" "$node_version"
  done
  for node_version in 20.19.0 21.7.3 22.14.0 22.17.9 23.11.0; do
    expect_guard reject "$cli_version" "$node_version"
  done
done

for cli_version in 0.9.3 0.11.1; do
  for node_version in 22.14.0 22.17.9 22.18.0 23.11.0 24.0.0; do
    expect_guard accept "$cli_version" "$node_version"
  done
  for node_version in 20.19.0 21.7.3 22.13.9; do
    expect_guard reject "$cli_version" "$node_version"
  done
done

if [ "$failures" -ne 0 ]; then
  exit 1
fi

echo "OK: the node-version guard follows the CLI engines range of the pinned version"
