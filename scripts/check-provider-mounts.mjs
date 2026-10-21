#!/usr/bin/env node
/**
 * Every React context in this tree that throws when it is read outside its
 * provider is only safe if one of two things holds:
 *
 *   1. the provider is mounted somewhere in `src/`, or
 *   2. no shipped component imports the hook.
 *
 * 0.36.0 broke rule (2): the aux panel was replaced with a context-driven
 * version whose provider is not mounted in this tree, so the workspace layout's
 * `<AuxPanel />` threw on the first render and every launch died on Next's
 * global error page. This check turns that class of merge mistake into a failed
 * build instead of a broken release.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = new URL("..", import.meta.url).pathname
const SRC = join(ROOT, "src")

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

const files = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f))
const isTest = (f) => /\.(test|spec)\.(ts|tsx)$/.test(f)
const isContextModule = (f) => relative(SRC, f).startsWith("contexts/")

// hook -> provider, from `throw new Error("useX must be used within XProvider")`
const hooks = new Map()
for (const file of files.filter((f) => isContextModule(f) && !isTest(f))) {
  const text = readFileSync(file, "utf8")
  for (const match of text.matchAll(/must be used within ([A-Za-z0-9_]+)/g)) {
    const provider = match[1]
    const hookMatch = text.match(
      new RegExp(
        `export function (use[A-Za-z0-9_]+)\\([^)]*\\)[^{]*\\{[^}]*must be used within ${provider}`
      )
    )
    if (hookMatch) hooks.set(hookMatch[1], provider)
    else if (![...hooks.values()].includes(provider))
      hooks.set(`(unknown hook of ${provider})`, provider)
  }
}

const problems = []
for (const [hook, provider] of hooks) {
  const mounted = files.some(
    (f) =>
      !isContextModule(f) &&
      !isTest(f) &&
      readFileSync(f, "utf8").includes(`<${provider}`)
  )
  if (mounted) continue
  const importers = files.filter(
    (f) =>
      !isContextModule(f) &&
      !isTest(f) &&
      new RegExp(`\\b${hook}\\b`).test(readFileSync(f, "utf8"))
  )
  if (importers.length) {
    problems.push(
      `${hook} throws without <${provider}>, and these components import it: ` +
        importers.map((f) => relative(ROOT, f)).join(", ")
    )
  }
}

if (problems.length) {
  console.error("Provider mount check failed:")
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log(
  `Provider mount check passed (${hooks.size} throwing hooks, all either mounted or unimported).`
)
