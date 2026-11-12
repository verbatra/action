# QA placeholder-dropped self-test fixture

A committed German translation that drops the `{{name}}` placeholder of the English source. `check` with `qa: "true"` must fail the step against it, and `check` without `qa` must pass, which shows the failure comes from the quality check. Needs `@verbatra/cli` 0.12.0.
