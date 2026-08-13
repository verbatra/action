# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities through GitHub's private vulnerability
reporting: open the repository's Security tab and choose "Report a vulnerability"
(https://github.com/verbatra/action/security/advisories/new). This
keeps the report private until a fix is available.

Do not open a public issue or pull request for a security vulnerability.

We aim to acknowledge a report within five business days, and we will keep you
informed as we investigate and work on a fix.

Report here if the issue is in this repository: `action.yml`, the annotation and
job-summary scripts, or the workflows. If the issue is in the translation engine
itself, in `@verbatra/cli`, `@verbatra/sdk`, or `@verbatra/studio`, report it
against the main project instead
(https://github.com/mariokreitz/verbatra/security/advisories/new), because that
is where a fix would ship.

## Supported versions

This action is not yet published to the GitHub Marketplace and this repository
carries no tags, so there is no released version line to support today. Until the
first release is cut, `main` is the only reference, and security fixes land there.

Once releases begin, security fixes will target the latest released major, which
consumers track through the moving `v1` tag. This is stated without version
numbers on purpose: a numbered table goes stale the moment a release ships, and a
security policy that names an outdated line is worse than one that names none.

Note that the version of the translation engine an action run executes is not set
by this repository at all. It is the `version` input in your own workflow, which
pins an exact `@verbatra/cli` release from npm. Keeping that input current is how
you pick up engine security fixes; updating the action reference alone does not.

## Supply-chain controls

Nothing in this repository is published to npm. The `package.json` is marked
private and carries devDependencies only, so this repository has no publishing
credentials and no release token to leak. The controls below are what protect a
consumer who runs this action.

- **Every `uses:` reference is pinned to a full commit SHA**, in the workflows and
  in the composite `action.yml` itself, with the human-readable version kept in a
  trailing comment so the pin stays reviewable.
- **The `version` input must be an exact semver version.** The action rejects
  dist-tags such as `latest`, ranges, and `^` or `~` prefixes, and it does so
  before anything is installed. A floating version would resolve at run time to
  whatever is newest, which is not reproducible and would auto-pull a compromised
  release. A dedicated CI job asserts that this guard still rejects `latest`.
- **The lockfile is committed and CI installs are frozen** with `npm ci`, so a
  build resolves the exact dependency tree that was reviewed.
- **Workflows default to a read-only token.** The CI workflow declares
  `contents: read` at the workflow level, and both jobs restate it at the job
  level so a later workflow-level widening cannot silently reach them. Nothing
  here writes to the repository, comments on a pull request, or publishes.
- **Dependabot runs weekly** over both the npm manifest and every Actions
  manifest, which is what keeps the SHA pins current: without it a pin ages
  silently instead of drifting visibly.
- **Secret scanning and push protection are enabled** on this repository.
- **Untrusted values never reach a workflow command unescaped.** Action inputs
  travel to bash through `env:` as data and are expanded into a quoted array, so a
  crafted value stays an argument and is never evaluated as shell. Annotation text
  built from CLI output is percent-encoded, so a value cannot break out of a
  `::error::` line and forge a second workflow command.

## Handling of API keys

The action never accepts a provider API key as an input. Keys are supplied only
through `env:` from `${{ secrets.* }}`, and both the action and the CLI read them
only from the environment: never from config files, never from command-line
arguments, never written to disk, and never logged. Error messages name the
environment variable but never include its value. The version-input guard is
deliberately written the same way: it reports that the value is invalid without
echoing it back, because echoing an untrusted value onto an `::error::` line is
itself the injection risk.

A `dry-run: "true"` run constructs no provider and therefore needs no key at all,
which is what makes it safe to run on a pull request from a fork, where no secret
is available.
