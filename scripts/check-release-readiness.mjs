#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const root = path.resolve(new URL("..", import.meta.url).pathname)
const args = new Set(process.argv.slice(2))
const expectedVersion =
  valueArg("--version") || readJson("package.json").version
const remoteChecks = args.has("--remote")
const docsRoot = valueArg("--docs-root") || "/home/dev/next-ai-saas"
const productionManifestUrl =
  "https://agent.houflow.com/downloads/houhub/latest.json"
const githubReleaseBase = `https://github.com/fleap-fly/houhub/releases/download/v${expectedVersion}/`

const failures = []
const warnings = []

function valueArg(name) {
  const prefix = `${name}=`
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : null
}

function run(command, commandArgs, options = {}) {
  return execFileSync(command, commandArgs, {
    cwd: options.cwd || root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", options.quiet ? "ignore" : "pipe"],
  }).trim()
}

function tryRun(command, commandArgs, options = {}) {
  try {
    return run(command, commandArgs, { ...options, quiet: true })
  } catch {
    return null
  }
}

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8")
}

function readJson(file) {
  return JSON.parse(read(file))
}

function fail(message) {
  failures.push(message)
}

function warn(message) {
  warnings.push(message)
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label}: expected ${expected}, got ${actual}`)
}

async function fetchText(url, options = {}) {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: options.redirect || "follow",
    })
    const text = await response.text()
    return { response, text, error: null }
  } catch (error) {
    return { response: null, text: "", error }
  }
}

function normalizeJsonText(text) {
  return `${JSON.stringify(JSON.parse(text), null, 2)}\n`
}

async function fetchGitHubReleaseText(url) {
  const fetched = await fetchText(url)
  if (!fetched.error) return fetched

  const fallback = tryRun("curl", [
    "-fsSL",
    "--retry",
    "3",
    "--connect-timeout",
    "20",
    url,
  ])
  if (fallback !== null) {
    return {
      response: { ok: true, status: 200 },
      text: fallback,
      error: null,
    }
  }
  return fetched
}

function forbiddenNeedles() {
  const join = (...parts) => parts.join("")
  return [
    join("co", "deg"),
    join("Co", "deG"),
    join("xin", "taofei"),
    join("cursor", "agent"),
    join("release", "-bot"),
    join("github.com/", "xin", "taofei"),
    join("weixin", "-group"),
    join("wechat", "-group"),
    join("qq", "-course", "-group"),
  ]
}

function listTrackedFiles() {
  return run("git", ["ls-files", "--cached", "--others", "--exclude-standard"])
    .split("\n")
    .filter(Boolean)
}

function isBinary(buffer) {
  return buffer.includes(0)
}

function shouldScan(file) {
  if (file === "scripts/check-release-readiness.mjs") return false
  if (file === "src-tauri/Cargo.lock") return false
  if (file.endsWith(".png") || file.endsWith(".ico") || file.endsWith(".icns"))
    return false
  if (
    file.endsWith(".dmg") ||
    file.endsWith(".exe") ||
    file.endsWith(".tar.gz")
  )
    return false
  return true
}

function checkBrandHygiene() {
  const hits = []
  const needles = forbiddenNeedles()

  for (const file of listTrackedFiles()) {
    if (!shouldScan(file)) continue
    const absolute = path.join(root, file)
    if (!fs.existsSync(absolute)) continue
    const buffer = fs.readFileSync(absolute)
    if (isBinary(buffer)) continue
    const text = buffer.toString("utf8")
    const lower = text.toLowerCase()
    for (const needle of needles) {
      const found = lower.indexOf(needle.toLowerCase())
      if (found !== -1) {
        const line = text.slice(0, found).split(/\r?\n/).length
        hits.push(`${file}:${line} contains forbidden upstream/contact marker`)
      }
    }
  }

  if (hits.length) {
    fail(
      `brand hygiene failed:\n${hits
        .slice(0, 40)
        .map((hit) => `  - ${hit}`)
        .join("\n")}`
    )
  }
}

function checkVersions() {
  const pkg = readJson("package.json")
  const tauri = readJson("src-tauri/tauri.conf.json")
  const cargo = read("src-tauri/Cargo.toml")
  const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1]

  assertEqual(pkg.name, "houhub", "package name")
  assertEqual(pkg.version, expectedVersion, "package version")
  assertEqual(tauri.productName, "houhub", "Tauri productName")
  assertEqual(tauri.version, expectedVersion, "Tauri version")
  assertEqual(tauri.identifier, "com.houflow.houhub", "Tauri identifier")
  assertEqual(cargoVersion, expectedVersion, "Cargo version")
}

function checkUpdater() {
  const tauri = readJson("src-tauri/tauri.conf.json")
  const endpoints = tauri.plugins?.updater?.endpoints || []
  if (
    !endpoints.includes(
      "https://agent.houflow.com/downloads/houhub/latest.json"
    )
  ) {
    fail(
      "updater endpoint must include https://agent.houflow.com/downloads/houhub/latest.json"
    )
  }
  const pubkey = String(tauri.plugins?.updater?.pubkey || "").trim()
  if (!pubkey) fail("Tauri updater pubkey is empty")
}

function checkWorkflow() {
  const workflow = read(".github/workflows/release.yml")
  const required = [
    "TAURI_SIGNING_PRIVATE_KEY",
    "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
    "https://github.com/${process.env.GITHUB_REPOSITORY}/releases/download/${tag}/",
    "latest.json",
    "houhub_${version}_aarch64.app.tar.gz",
    "houhub_${version}_x64.app.tar.gz",
    "houhub_${version}_x64-setup.exe",
  ]
  for (const token of required) {
    if (!workflow.includes(token)) fail(`release workflow missing ${token}`)
  }
}

function checkWechatCapability() {
  const requiredFiles = [
    "src-tauri/src/chat_channel/backends/weixin.rs",
    "src-tauri/src/chat_channel/backends/mod.rs",
    "src/i18n/messages/zh-CN.json",
  ]
  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(root, file)))
      fail(`WeChat capability file missing: ${file}`)
  }

  const weixinBackend = read("src-tauri/src/chat_channel/backends/weixin.rs")
  if (!weixinBackend.includes("weixin_get_qrcode")) {
    fail("WeChat backend missing QR login command marker")
  }
}

function checkGitIdentity() {
  const latest = run("git", ["log", "-1", "--format=%an <%ae>|%cn <%ce>"])
  const expected = "fleap.fly <199331649+fleap-fly@users.noreply.github.com>"
  if (!latest.split("|").every((identity) => identity === expected)) {
    fail(`latest commit identity must be ${expected}; got ${latest}`)
  }

  const tag = tryRun("git", [
    "for-each-ref",
    `refs/tags/v${expectedVersion}`,
    "--format=%(taggername) %(taggeremail)",
  ])
  if (tag && tag !== "<>") {
    if (tag !== expected)
      warn(`tagger identity is ${tag}; expected ${expected}`)
  }
}

function checkDocsLinks() {
  if (!fs.existsSync(docsRoot)) {
    warn(`docs root not found: ${docsRoot}`)
    return
  }
  const docsFiles = [
    "apps/headquarters/content/docs/agent-platform/desktop.mdx",
    "apps/headquarters/content/docs/agent-platform/desktop.zh.mdx",
    "apps/headquarters/content/docs/ai-assistant/modes.mdx",
    "apps/headquarters/content/docs/ai-assistant/modes.zh.mdx",
  ]
  const stableLinks = [
    "/downloads/houhub/macos-arm64",
    "/downloads/houhub/macos-x64",
    "/downloads/houhub/windows-x64",
  ]
  for (const file of docsFiles) {
    const absolute = path.join(docsRoot, file)
    if (!fs.existsSync(absolute)) {
      warn(`docs file not found: ${absolute}`)
      continue
    }
    const text = fs.readFileSync(absolute, "utf8")
    if (/houhub_0\.\d+\.\d+_/.test(text))
      fail(`${file} still has versioned HouHub download links`)
    for (const link of stableLinks) {
      if (!text.includes(link))
        fail(`${file} missing stable download link ${link}`)
    }
  }
}

async function checkRemoteState() {
  const secretList = tryRun("gh", [
    "secret",
    "list",
    "--repo",
    "fleap-fly/houhub",
  ])
  if (!secretList) {
    warn("could not read GitHub secrets with gh")
  } else {
    for (const secret of [
      "TAURI_SIGNING_PRIVATE_KEY",
      "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
    ]) {
      if (!secretList.includes(secret)) fail(`GitHub secret missing: ${secret}`)
    }
  }

  const releaseJson = tryRun("gh", [
    "release",
    "view",
    `v${expectedVersion}`,
    "--repo",
    "fleap-fly/houhub",
    "--json",
    "tagName,assets",
  ])
  if (!releaseJson) {
    fail(`release v${expectedVersion} is not readable yet`)
  } else {
    const release = JSON.parse(releaseJson)
    const assetNames = new Set(
      (release.assets || []).map((asset) => asset.name)
    )
    for (const asset of [
      `houhub_${expectedVersion}_aarch64.dmg`,
      `houhub_${expectedVersion}_aarch64.app.tar.gz`,
      `houhub_${expectedVersion}_aarch64.app.tar.gz.sig`,
      `houhub_${expectedVersion}_x64.dmg`,
      `houhub_${expectedVersion}_x64.app.tar.gz`,
      `houhub_${expectedVersion}_x64.app.tar.gz.sig`,
      `houhub_${expectedVersion}_x64-setup.exe`,
      `houhub_${expectedVersion}_x64-setup.exe.sig`,
      "latest.json",
    ]) {
      if (!assetNames.has(asset)) fail(`release asset missing: ${asset}`)
    }
  }

  const githubLatestUrl = `${githubReleaseBase}latest.json`
  const githubLatest = await fetchGitHubReleaseText(githubLatestUrl)
  if (githubLatest.error) {
    fail(`could not fetch GitHub latest.json: ${githubLatest.error.message}`)
    return
  }
  if (!githubLatest.response?.ok) {
    fail(`GitHub latest.json returned HTTP ${githubLatest.response.status}`)
    return
  }

  const productionLatest = await fetchText(productionManifestUrl)
  if (productionLatest.error) {
    fail(
      `could not fetch production latest.json: ${productionLatest.error.message}`
    )
    return
  }
  if (!productionLatest.response?.ok) {
    fail(
      `production latest.json returned HTTP ${productionLatest.response.status}`
    )
    return
  }

  const cacheControl =
    productionLatest.response.headers.get("cache-control") || ""
  if (!/no-store/i.test(cacheControl) || !/no-cache/i.test(cacheControl)) {
    fail(
      `production latest.json must be no-cache/no-store; got Cache-Control: ${cacheControl || "(missing)"}`
    )
  }

  let releaseManifest
  let manifest
  try {
    releaseManifest = JSON.parse(githubLatest.text)
    manifest = JSON.parse(productionLatest.text)
  } catch (error) {
    fail(`latest.json is invalid JSON: ${error.message}`)
    return
  }

  if (
    normalizeJsonText(githubLatest.text) !==
    normalizeJsonText(productionLatest.text)
  ) {
    fail("production latest.json does not match GitHub release latest.json")
  }

  if (releaseManifest.version !== expectedVersion) {
    fail(
      `GitHub latest.json version expected ${expectedVersion}, got ${releaseManifest.version}`
    )
  }
  if (manifest.version !== expectedVersion) {
    fail(
      `production latest.json version expected ${expectedVersion}, got ${manifest.version}`
    )
  }
  for (const entry of Object.values(manifest.platforms || {})) {
    const url = String(entry?.url || "")
    const signature = String(entry?.signature || "")
    if (
      !url.startsWith(githubReleaseBase) ||
      !url.includes(`houhub_${expectedVersion}_`)
    ) {
      fail(
        `production manifest has non-GitHub, non-versioned, or stale URL: ${url}`
      )
    }
    if (!signature) fail(`production manifest has empty signature for ${url}`)
  }

  const installerRoutes = [
    {
      route: "https://houflow.com/downloads/houhub/macos-arm64",
      suffix: `houhub_${expectedVersion}_aarch64.dmg`,
    },
    {
      route: "https://houflow.com/downloads/houhub/macos-x64",
      suffix: `houhub_${expectedVersion}_x64.dmg`,
    },
    {
      route: "https://houflow.com/downloads/houhub/windows-x64",
      suffix: `houhub_${expectedVersion}_x64-setup.exe`,
    },
  ]
  for (const item of installerRoutes) {
    const routeCheck = await fetchText(item.route, { redirect: "manual" })
    if (routeCheck.error) {
      fail(`could not fetch ${item.route}: ${routeCheck.error.message}`)
      continue
    }
    const route = routeCheck.response
    const location = route.headers.get("location") || ""
    if (route.status !== 302) {
      fail(`${item.route} expected HTTP 302, got ${route.status}`)
    }
    if (
      !location.startsWith(githubReleaseBase) ||
      !location.includes(item.suffix)
    ) {
      fail(
        `${item.route} redirects to unexpected location: ${location || "(missing)"}`
      )
    }
  }
}

checkBrandHygiene()
checkVersions()
checkUpdater()
checkWorkflow()
checkWechatCapability()
checkGitIdentity()
checkDocsLinks()

if (remoteChecks) {
  await checkRemoteState()
}

for (const warning of warnings) {
  console.warn(`WARN ${warning}`)
}

if (failures.length) {
  console.error(failures.map((failure) => `FAIL ${failure}`).join("\n"))
  process.exit(1)
}

console.log(
  `HouHub release readiness checks passed for ${expectedVersion}${remoteChecks ? " with remote checks" : ""}.`
)
