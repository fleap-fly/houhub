# Stage 1: Build Next.js static export
FROM node:22-alpine AS frontend
RUN corepack enable && corepack prepare pnpm@11.6.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY vendor/ ./vendor/
RUN pnpm install --frozen-lockfile
COPY src/ ./src/
COPY public/ ./public/
COPY next.config.ts tsconfig.json postcss.config.mjs components.json ./
RUN pnpm build

# Stage 2: Build Rust server binary + houhub-mcp companion
FROM rust:slim-bookworm AS backend
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /app/src-tauri
COPY src-tauri/ ./
# houhub-mcp is the stdio MCP companion the runtime injects per session
# (see acp/delegation/companion.rs). It must ship next to houhub-server so
# `locate_houhub_mcp_binary()` finds it via the exe-sibling lookup.
RUN cargo build --release --bin houhub-server --no-default-features \
 && cargo build --release --bin houhub-mcp --no-default-features

# Stage 3: Runtime
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y \
    libsqlite3-0 \
    git \
    openssh-client \
    ca-certificates \
    curl \
    python3 \
    python3-pip \
    libicu72 \
    && rm -rf /var/lib/apt/lists/*
# libicu72: OfficeCLI ships as a self-contained binary with an embedded .NET
# runtime, which requires the system ICU library at startup. node:*-bookworm-slim
# bundles Node's own ICU statically and so does NOT install system libicu — without
# this, every `officecli` invocation aborts with "Couldn't find a valid ICU package
# installed on the system", breaking both skill sync and office file preview in the
# server/Docker mode. The version (72) is pinned to Debian bookworm; bump it to match
# if the base image moves to a newer Debian release (e.g. trixie ships libicu76).

COPY --from=backend /app/src-tauri/target/release/houhub-server /usr/local/bin/houhub-server
COPY --from=backend /app/src-tauri/target/release/houhub-mcp /usr/local/bin/houhub-mcp
COPY --from=frontend /app/out /app/web

ENV HOUHUB_STATIC_DIR=/app/web
ENV HOUHUB_DATA_DIR=/data
ENV HOUHUB_PORT=3080
ENV HOUHUB_HOST=0.0.0.0
ENV SHELL=/bin/bash
# In-place self-update markers: tells the running server it is a container
# (for the post-upgrade "also pull the image" hint) and how long the
# supervisor waits before relaunching the worker after an upgrade.
ENV HOUHUB_RUNTIME=docker
ENV HOUHUB_RESTART_DELAY_MS=2000

EXPOSE 3080
VOLUME /data

# Run under the built-in supervisor (PID 1) so an in-place upgrade can swap
# the binary and have the worker relaunched without stopping the container.
CMD ["houhub-server", "--supervise"]
