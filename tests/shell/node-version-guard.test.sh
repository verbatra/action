#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/harness.sh"

stub_dir="$work_dir/stub"
output="$work_dir/output.txt"
write_exec_capturing_npm_stub "$stub_dir"
real_node="$(command -v node)"
cat >"$stub_dir/node" <<STUB
#!/usr/bin/env bash
if [ "\$1" = "-p" ]; then
  printf '%s\n' "\$STUB_NODE_VERSION"
  exit 0
fi
exec "$real_node" "\$@"
STUB
chmod +x "$stub_dir/node"

fixture_dir="$(fixture_path config-guard-present)"

expect_guard() {
  local verdict="$1" cli_version="$2" node_version="$3"
  if run_step "$output" \
    PATH="$stub_dir:$PATH" \
    STUB_NODE_VERSION="$node_version" \
    VERBATRA_VERSION="$cli_version" \
    COMMAND="check" \
    WORKING_DIRECTORY="$fixture_dir"; then
    if [ "$verdict" = "reject" ]; then
      fail "CLI $cli_version with Node.js $node_version was accepted, but is outside the supported range"
    fi
  elif [ "$verdict" = "accept" ]; then
    fail "CLI $cli_version with Node.js $node_version was rejected, but is supported"
    cat "$output"
  elif ! grep -q 'the node-version input resolved to' "$output"; then
    fail "CLI $cli_version with Node.js $node_version was rejected, but not by the node-version guard"
    cat "$output"
  fi
}

for cli_version in 0.12.0 0.12.0-next.0 0.12.3; do
  for node_version in 22.18.0 22.21.1 24.0.0 24.21.0 25.1.0 26.0.0 27.0.0; do
    expect_guard accept "$cli_version" "$node_version"
  done
  for node_version in 20.19.0 21.7.3 22.14.0 22.17.9 23.11.0; do
    expect_guard reject "$cli_version" "$node_version"
  done
done

for cli_version in 0.13.0 0.13.0-next.0 0.13.2 1.0.0; do
  for node_version in 22.22.0 22.23.4 24.0.0 24.22.2 26.0.0 26.13.0 28.0.0; do
    expect_guard accept "$cli_version" "$node_version"
  done
  for node_version in 20.19.0 21.7.3 22.14.0 22.18.0 22.21.1 23.11.0 25.1.0 27.0.0; do
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

finish "the node-version guard follows the CLI engines range of the pinned version"
