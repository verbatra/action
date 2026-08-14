---
name: Bug report
about: Report a problem with the verbatra GitHub Action
title: ""
labels: bug
assignees: ""
---

Use this for problems with the action itself: its inputs, the `action.yml`
wiring, the annotations, or the job summary. Problems with translation behavior,
formats, providers, or the CLI belong in the
[main repository](https://github.com/verbatra/verbatra/issues).

## What happened

A clear description of the bug.

## Expected behavior

What you expected to happen instead.

## Steps to reproduce

1.
2.
3.

## Environment

- Action reference (the tag or commit SHA after `uses: verbatra/action@`):
- `version` input (the pinned `@verbatra/cli` version):
- Runner OS (for example `ubuntu-latest`, or your self-hosted runner's OS):
- `node-version` input (if you set one):
- Provider (if relevant):

## Workflow snippet

The step that runs the action, and the surrounding `permissions:` and `env:`
blocks:

```yaml

```

## Logs

The failing step's output, and the job summary if it rendered. Do not paste API
keys or other secrets: redact them before posting. GitHub masks secret values in
logs, but a value you copy out of a config file or an error message of your own
is not masked.
