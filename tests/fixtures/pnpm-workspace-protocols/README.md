Reproduces the exact bug that broke this action for real pnpm monorepo
consumers (including verbatra's own docs site): a package.json in
working-directory using pnpm's workspace:* and catalog: protocols for
its OWN unrelated dependencies. Plain `npm install` cannot parse either
protocol string and crashes (EUNSUPPORTEDPROTOCOL) the moment it reads
a package.json containing one, regardless of what's actually being
installed. The action must never let npm read this file directly.
