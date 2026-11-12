# Sensitive-source self-test fixture

The English source holds an email address, and the config sets `sensitiveData.mode` to `block`. `check` with `sensitive: "true"` must fail the step against it, and `check` without it must pass. Needs `@verbatra/cli` 0.12.0.
