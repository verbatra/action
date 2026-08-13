# Dry-run self-test fixture

A minimal verbatra project used only by the `self-test` job in
`.github/workflows/ci.yml`. It exists so the composite action in `action.yml` is
exercised end to end on every push, rather than only being read.

`de.json` is intentionally empty, so both source keys report as missing and the
run has real work to describe. The run is always a dry run, so nothing here is
ever written to.

The `provider` block names `anthropic` because the config schema requires a
provider, not because one is contacted. `translate --dry-run` never constructs a
provider (`packages/sdk/src/flow/translate-project.ts` in the verbatra monorepo
selects a provider only when `dryRun` is false), so no API key is read and no
network call to a provider is made. The self-test therefore runs on a fork pull
request with no secrets available.
