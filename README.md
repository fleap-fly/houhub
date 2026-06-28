# houhub

This repository contains only the houhub desktop app. Shared Agent Hub
contracts used by the desktop build are vendored as npm tarballs under
`vendor/` so this repository can build macOS and Windows installers without
checking out unrelated service repositories.

## Houflow integration

- Connect Houflow from `Settings -> Connect Houflow`.
- The signed-in Houflow workspace is used to load Agent Hub workspaces,
  managed agents, hosted connected agents, external connected agents, and the
  managed Houflow model gateway.
- Agent Hub contracts and HTTP behavior come from:
  - `@houshan/agent-hub-sdk`
  - `@houshan/agent-hub-network-sdk`

## Development

```bash
corepack enable
pnpm install
pnpm dev
```

## Release Builds

GitHub Actions builds macOS and Windows installers from this repository:

- branch pushes and manual runs upload workflow artifacts
- `v*` tags create a GitHub Release with the generated installers
