---
name: houhub-release-harness
description: Use inside /home/dev/houhub when syncing upstream changes, preparing HouHub desktop releases, checking brand isolation, updating download docs, or diagnosing release workflow/static download regressions.
---

# HouHub Release Harness

This is a repo-local skill for `/home/dev/houhub`. Keep it with the desktop repository so future upstream merges and releases use the same guardrails.

## Hard Rules

- Do not reintroduce upstream brand/contact/history artifacts. HouHub release files must not carry upstream names, maintainers, bot identities, repo URLs, or promotional contact assets.
- Do not remove WeChat chat capability. Functional WeChat/Weixin code is expected; promotional group/contact images and docs are not.
- Keep docs download links stable through `/downloads/houhub/macos-arm64`, `/downloads/houhub/macos-x64`, and `/downloads/houhub/windows-x64`.
- Do not print updater signing secrets. Use `gh secret list` to confirm secret names only.
- Keep local work in `/home/dev/houhub`; do not create alternate clean repos unless explicitly requested.

## Required Checks

Before tagging or publishing:

```bash
cd /home/dev/houhub
pnpm release:check
```

Before declaring a public release complete:

```bash
cd /home/dev/houhub
pnpm release:check:remote
```

The harness checks package/Cargo/Tauri versions, updater endpoint, release workflow signing requirements, WeChat capability presence, commit identity, docs stable download links, and upstream brand/contact contamination.

## Release Flow

1. Inspect dirty worktrees in `/home/dev/houhub` and `/home/dev/next-ai-saas`; avoid unrelated changes.
2. Run `pnpm release:check`.
3. Confirm GitHub secrets exist: `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
4. Create or move the `vX.Y.Z` tag using `fleap.fly <199331649+fleap-fly@users.noreply.github.com>`.
5. Push the tag and monitor the `Desktop Release` workflow.
6. Verify release assets include macOS DMG, macOS updater tar/signatures, Windows installer/signature, SHA256SUMS, and `latest.json`.
7. Sync only the release `latest.json` to production at `/home/dev/next-ai-saas/apps/agent-hub/public/downloads/houhub/latest.json`; do not mirror installer/updater packages. The manifest points to GitHub versioned release assets. Ensure the production file is world-readable (`0644`) after sync so nginx can serve it.
8. Verify `https://agent.houflow.com/downloads/houhub/latest.json` is no-cache/no-store, exactly matches the GitHub release `latest.json`, and points to versioned GitHub artifact URLs.
9. Verify docs download routes redirect to current installer artifacts.
10. Run `pnpm release:check:remote`.

## Common Pitfalls

- GitHub contributors and graphs may lag, but commits/tags still need the required fleap.fly identity.
- Changing the Tauri updater public key means older clients cannot auto-update through the previous key and need one manual install.
- `latest.json` must not be immutable-cached. Installer artifacts may be immutable.
- Production only needs `latest.json`; large DMG/EXE/tar assets stay on GitHub Releases. Syncing big packages to `/downloads/houhub` is unnecessary and makes cleanup error-prone.
- If production `latest.json` is synced with `0600` permissions, nginx returns HTTP 403. Always verify permissions and public HTTP status after sync.
- Docs should not hardcode `houhub_0.x.y_*` links; use the stable download routes.
