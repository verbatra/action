# In-sync self-test fixture

A minimal verbatra project used only by the `self-test` job in
`.github/workflows/ci.yml`. It is the counterpart to `../dry-run`: every source
key already has a translation in `de.json`, so `check` reports `inSync: true` and
`diff` reports `hasPendingChanges: false`, and both exit 0.

The `../dry-run` fixture proves the read-only commands fail a job when locales
have drifted. This one proves the opposite direction: that a project in sync
passes the gate rather than failing it for an unrelated reason. Without it, a
renderer that failed unconditionally would still look correct in CI.

There is deliberately no `verbatra.lock.json` here. Staleness is computed only
against a recorded baseline hash in that lock file, so with no lock file present
no key can be stale and the fixture stays in sync purely on its contents.

The `provider` block names `anthropic` because the config schema requires a
provider, not because one is contacted. `check` and `diff` are read-only: they
never construct a provider, so no API key is read and no network call to a
provider is made. These steps therefore run on a fork pull request with no
secrets available.
