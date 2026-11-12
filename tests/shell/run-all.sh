#!/usr/bin/env bash
set -uo pipefail

failed=0
for test_file in "$(dirname "$0")"/*.test.sh; do
  echo "--- $(basename "$test_file")"
  if ! bash "$test_file"; then
    failed=1
  fi
done
exit "$failed"
