# Config-guard-not-inherited self-test fixture

Proves two things about the pre-flight config guard added to `action.yml`:
"strict, not inherited" (config discovery never walks up into a parent
directory), and the fail-fast behavior when no config exists at the resolved
`working-directory`.

The layout is a nested verbatra project. The fixture root (this directory)
holds a complete, valid project: `.verbatrarc.json` plus `locales/`. The
`child/` subdirectory has its own `locales/` but no config file of its own.

The `self-test` job in `.github/workflows/ci.yml` points `working-directory`
at `child`, not at the fixture root. Before the guard existed, the CLI's own
upward `cosmiconfig` search (bounded at the nearest ancestor `.git`, which in
CI is this repository's checkout root) would find the parent's
`.verbatrarc.json` and the command would wrongly succeed, translating or
checking `child`'s locales against a config it never declared. The guard must
fail the step instead, and the failure message must name `child`'s own
resolved absolute path, not the parent's, proving the guard looked exactly
where `working-directory` resolved to and nowhere else.
