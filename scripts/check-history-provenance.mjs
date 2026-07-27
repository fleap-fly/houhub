#!/usr/bin/env node
import { execFileSync } from "node:child_process"

const blockedLocalPart = ["xin", "taofei"].join("")
const blockedEmails = new Set([
  "itpkcn@gmail.com",
  `${blockedLocalPart}@users.noreply.github.com`,
])
const separator = "\u001f"
const format = ["%H", "%an", "%ae", "%cn", "%ce"].join(separator)

const output = execFileSync("git", ["log", `--format=${format}`, "HEAD"], {
  encoding: "utf8",
})
const violations = output
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => line.split(separator))
  .filter(([, , authorEmail, , committerEmail]) =>
    blockedEmails.has(authorEmail) || blockedEmails.has(committerEmail)
  )
  .map(([commit, authorName, authorEmail, committerName, committerEmail]) => ({
    commit,
    author: `${authorName} <${authorEmail}>`,
    committer: `${committerName} <${committerEmail}>`,
  }))

if (violations.length) {
  console.error("Blocked external Git identities are reachable from HEAD:")
  for (const violation of violations.slice(0, 20)) {
    console.error(
      `  ${violation.commit}: ${violation.author} | ${violation.committer}`
    )
  }
  if (violations.length > 20) {
    console.error(`  ... and ${violations.length - 20} more`)
  }
  process.exit(1)
}

console.log("History provenance check passed.")
