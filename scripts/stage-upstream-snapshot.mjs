#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const args = parseArgs(process.argv.slice(2))
const snapshotRoot = resolve(root, ".upstream")
const safeRef = args.ref.replace(/[^A-Za-z0-9._-]+/g, "-")
const snapshotDir = resolve(
  snapshotRoot,
  `${safeRef || "snapshot"}-${Date.now()}-${process.pid}`
)

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

async function main() {
  assertWithinSnapshotRoot(snapshotDir)
  mkdirSync(snapshotDir, { recursive: true })

  const archivePath = join(snapshotDir, "source.tar.gz")
  const extractDir = join(snapshotDir, "extract")
  const archiveUrl = `https://github.com/${args.repo}/archive/${encodeURIComponent(args.ref)}.tar.gz`

  await download(archiveUrl, archivePath)
  run("tar", ["-xzf", archivePath, "-C", extractDir])

  const sourceRoot = firstExtractedDirectory(extractDir)
  console.log(`Staged source snapshot: ${relative(root, sourceRoot)}`)
  console.log("No product files or Git refs were changed.")
}

function parseArgs(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === "--repo" || argument === "--ref") {
      const value = argv[index + 1]
      if (!value) throw new Error(`${argument} requires a value`)
      values[argument.slice(2)] = value
      index += 1
      continue
    }
    if (argument.startsWith("--repo=") || argument.startsWith("--ref=")) {
      const [name, value] = argument.slice(2).split(/=(.*)/s)
      values[name] = value
      continue
    }
    throw new Error(`Unknown argument: ${argument}`)
  }

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(values.repo || "")) {
    throw new Error("--repo must be an owner/repository identifier")
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(values.ref || "")) {
    throw new Error("--ref must be a branch, tag, or commit identifier")
  }
  return values
}

async function download(url, outputPath) {
  const response = await fetch(url, { redirect: "follow" })
  if (!response.ok || !response.body) {
    throw new Error(`Snapshot download failed: HTTP ${response.status}`)
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(outputPath))
}

function run(command, commandArgs) {
  const result = execFileSync(command, commandArgs, { stdio: "inherit" })
  if (result.status && result.status !== 0) {
    throw new Error(`${command} exited with ${result.status}`)
  }
}

function firstExtractedDirectory(rootPath) {
  const directories = readdirSync(rootPath)
    .map((name) => join(rootPath, name))
    .filter((candidate) => statSync(candidate).isDirectory())
  if (directories.length !== 1) {
    throw new Error(`Expected one extracted source directory, found ${directories.length}`)
  }
  return directories[0]
}

function assertWithinSnapshotRoot(candidate) {
  if (candidate !== snapshotRoot && !candidate.startsWith(`${snapshotRoot}/`)) {
    throw new Error("Snapshot destination escapes .upstream")
  }
  if (existsSync(candidate)) {
    throw new Error("Snapshot destination already exists")
  }
}
