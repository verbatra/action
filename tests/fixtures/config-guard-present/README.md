# Config-guard-present self-test fixture

A minimal, in-sync verbatra project with a recognized config file
(`.verbatrarc.json`) directly inside its own root. Used only by the
`self-test` job in `.github/workflows/ci.yml`, wired as `working-directory`
against the pre-flight config guard added in `action.yml`.

This is the positive case for that guard: a project that is correctly
configured must still pass, so the step is wired to succeed rather than
`continue-on-error`. Without this fixture, a guard that rejects every project
regardless of whether a config exists would still look correct, because every
other self-test step already has its own config anyway.

`de.json` already has every source key translated, so `check` also reports
`inSync: true` and the step is not confused with an unrelated read-only-gate
failure.
