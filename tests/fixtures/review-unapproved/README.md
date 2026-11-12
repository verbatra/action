# Review-unapproved self-test fixture

Every German value is recorded in `verbatra.provenance.json` as machine-written and unreviewed, with the value hashes of the committed text. `check` with `require-reviewed: "true"` must fail the step against it, and `check` without it must pass. Needs `@verbatra/cli` 0.12.0.
