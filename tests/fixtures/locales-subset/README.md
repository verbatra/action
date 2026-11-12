# Locales-subset self-test fixture

`de` is in sync and `fr` is empty. `check` fails the step for the whole project, and `check` with `locales: "de"` passes it, which shows the input narrows the run.
