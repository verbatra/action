## What changed

Describe the change and why it is needed.

Closes #

## How it was tested

Commands you ran and cases you covered. If `action.yml` or `src/run.sh` changed, say how you
exercised it.

## Checklist

- [ ] Commits follow Conventional Commits
- [ ] Tests pass locally (`npm ci && npm test && npm run test:shell`) and coverage stays at or above 90%
- [ ] Any new `uses:` reference is pinned to a full commit SHA
- [ ] Values taken from CLI output are escaped for the position they land in
- [ ] A `CHANGELOG.md` bullet under `## [Unreleased]` covers any user-visible change
- [ ] Breaking change: this changes how an existing workflow behaves (an input, an output, an exit status, or the annotations), and its `CHANGELOG.md` bullet names the old behavior, the new one, and what a workflow must change, since it ships inside `v1`
- [ ] This belongs here, not in the [main repository](https://github.com/verbatra/verbatra)
