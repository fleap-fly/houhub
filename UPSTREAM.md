# External Source Snapshot Harness

This repository accepts external desktop changes as source snapshots only.
The snapshot workflow deliberately does not import another repository's Git
history, branches, tags, authors, or committers.

## Stage A Snapshot

Use a reviewed immutable revision and stage it outside the tracked tree:

```sh
node scripts/stage-upstream-snapshot.mjs --repo <owner/repository> --ref <commit-sha>
```

The command downloads and extracts the source under `.upstream/`. It never
copies files into the product tree and never changes Git refs. Review the
result, apply only the intended source changes, and commit them with the
HouHub repository identity.

## History Rules

Do not use `git merge`, `git rebase`, `git cherry-pick`, or a remote-tracking
branch to bring external changes into this repository. Those operations retain
external Git identity and invalidate the product's independent history.

`pnpm check:history-provenance` scans every reachable commit from `HEAD` for
blocked external identities. `pnpm release:check` runs the same gate before a
release. A failure must be resolved by rebuilding the affected change from a
source snapshot, not by suppressing the check.
