export interface LineChangeStats {
  additions: number
  deletions: number
}

const MAX_LCS_MATCH_PAIRS = 200_000
const MAX_LCS_WINDOW_PRODUCT = 1_000_000

export function splitNormalizedLines(text: string): string[] {
  if (!text) return []
  const lines = text.split("\n")
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop()
  }
  return lines
}

function contiguousChangedLineStats(
  oldLines: string[],
  newLines: string[]
): LineChangeStats {
  let prefix = 0
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] ===
      newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1
  }

  return {
    additions: Math.max(0, newLines.length - prefix - suffix),
    deletions: Math.max(0, oldLines.length - prefix - suffix),
  }
}

function trimCommonOuterLines(
  oldLines: string[],
  newLines: string[]
): { oldWindow: string[]; newWindow: string[] } {
  let prefix = 0
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] ===
      newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1
  }

  return {
    oldWindow: oldLines.slice(prefix, oldLines.length - suffix),
    newWindow: newLines.slice(prefix, newLines.length - suffix),
  }
}

function lowerBound(values: number[], target: number): number {
  let left = 0
  let right = values.length
  while (left < right) {
    const mid = left + ((right - left) >> 1)
    if (values[mid] < target) {
      left = mid + 1
    } else {
      right = mid
    }
  }
  return left
}

function exceedsLcsPairBudget(oldLines: string[], newLines: string[]): boolean {
  if (oldLines.length === 0 || newLines.length === 0) return false

  const oldFreq = new Map<string, number>()
  for (const line of oldLines) {
    oldFreq.set(line, (oldFreq.get(line) ?? 0) + 1)
  }

  const newFreq = new Map<string, number>()
  for (const line of newLines) {
    newFreq.set(line, (newFreq.get(line) ?? 0) + 1)
  }

  let pairs = 0
  for (const [line, oldCount] of oldFreq) {
    const newCount = newFreq.get(line)
    if (!newCount) continue
    pairs += oldCount * newCount
    if (pairs > MAX_LCS_MATCH_PAIRS) return true
  }

  return false
}

/**
 * Shared guard for the collapsed line stats and expanded unified diff. The
 * frequency-pair check catches duplicate-heavy windows that make an LCS
 * expensive even when their dimensions are modest; the product check keeps
 * genuinely large windows off the quadratic DP path.
 */
export function exceedsLineDiffBudget(
  oldLines: string[],
  newLines: string[]
): boolean {
  return (
    oldLines.length * newLines.length > MAX_LCS_WINDOW_PRODUCT ||
    exceedsLcsPairBudget(oldLines, newLines)
  )
}

function lcsLengthByLine(oldLines: string[], newLines: string[]): number {
  const positions = new Map<string, number[]>()
  for (let i = 0; i < newLines.length; i += 1) {
    const line = newLines[i]
    const bucket = positions.get(line)
    if (bucket) {
      bucket.push(i)
    } else {
      positions.set(line, [i])
    }
  }

  const lis: number[] = []
  for (const line of oldLines) {
    const bucket = positions.get(line)
    if (!bucket || bucket.length === 0) continue

    for (let i = bucket.length - 1; i >= 0; i -= 1) {
      const pos = bucket[i]
      const at = lowerBound(lis, pos)
      if (at === lis.length) {
        lis.push(pos)
      } else {
        lis[at] = pos
      }
    }
  }

  return lis.length
}

export function estimateChangedLineStats(
  oldText: string,
  newText: string
): LineChangeStats {
  const oldLines = splitNormalizedLines(oldText)
  const newLines = splitNormalizedLines(newText)

  if (oldLines.length === 0 && newLines.length === 0) {
    return { additions: 0, deletions: 0 }
  }
  if (oldLines.length === 0) {
    return { additions: newLines.length, deletions: 0 }
  }
  if (newLines.length === 0) {
    return { additions: 0, deletions: oldLines.length }
  }

  const { oldWindow, newWindow } = trimCommonOuterLines(oldLines, newLines)
  if (oldWindow.length === 0) {
    return { additions: newWindow.length, deletions: 0 }
  }
  if (newWindow.length === 0) {
    return { additions: 0, deletions: oldWindow.length }
  }

  if (exceedsLineDiffBudget(oldWindow, newWindow)) {
    return contiguousChangedLineStats(oldWindow, newWindow)
  }

  const lcs = lcsLengthByLine(oldWindow, newWindow)
  return {
    additions: Math.max(0, newWindow.length - lcs),
    deletions: Math.max(0, oldWindow.length - lcs),
  }
}

export function countUnifiedDiffLineChanges(text: string): LineChangeStats {
  const lines = text.split("\n")
  const hunkHeader = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/

  // When hunk headers are present, classify body lines by their declared
  // position. This keeps source lines whose content begins with `+++`/`---`
  // from being mistaken for the file headers.
  if (lines.some((line) => hunkHeader.test(line))) {
    let additions = 0
    let deletions = 0
    let i = 0
    while (i < lines.length) {
      const header = hunkHeader.exec(lines[i])
      i += 1
      if (!header) continue
      let oldRemaining = header[1] === undefined ? 1 : Number(header[1])
      let newRemaining = header[2] === undefined ? 1 : Number(header[2])
      while (i < lines.length && (oldRemaining > 0 || newRemaining > 0)) {
        const line = lines[i++]
        if (line.startsWith("\\")) continue
        if (line.startsWith("-")) {
          deletions += 1
          oldRemaining -= 1
        } else if (line.startsWith("+")) {
          additions += 1
          newRemaining -= 1
        } else {
          oldRemaining -= 1
          newRemaining -= 1
        }
      }
    }
    return { additions, deletions }
  }

  let additions = 0
  let deletions = 0
  for (const line of lines) {
    if (line.startsWith("+") && !/^\+\+\+ /.test(line)) additions += 1
    if (line.startsWith("-") && !/^--- /.test(line)) deletions += 1
  }
  return { additions, deletions }
}
