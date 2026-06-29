import type { HouflowCloudSessionOutput } from "./cloud-sessions"

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "ico",
])

const TEXT_EXTENSIONS = new Set([
  "css",
  "csv",
  "html",
  "htm",
  "js",
  "json",
  "jsx",
  "log",
  "md",
  "markdown",
  "svg",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
])

export function outputExtension(output: HouflowCloudSessionOutput): string {
  return fileExtension(output.relativePath || output.filename)
}

export function isCloudImageOutput(
  output: Pick<
    HouflowCloudSessionOutput,
    "filename" | "mediaType" | "relativePath"
  >
): boolean {
  return (
    output.mediaType.toLowerCase().startsWith("image/") ||
    IMAGE_EXTENSIONS.has(fileExtension(output.relativePath || output.filename))
  )
}

export function isCloudTextOutput(
  output: Pick<
    HouflowCloudSessionOutput,
    "filename" | "mediaType" | "relativePath"
  >
): boolean {
  const mediaType = output.mediaType.toLowerCase()
  return (
    mediaType.startsWith("text/") ||
    mediaType === "application/json" ||
    mediaType === "application/xml" ||
    mediaType.endsWith("+json") ||
    mediaType.endsWith("+xml") ||
    TEXT_EXTENSIONS.has(fileExtension(output.relativePath || output.filename))
  )
}

export function mediaTypeForCloudOutputBlob(
  output: Pick<
    HouflowCloudSessionOutput,
    "filename" | "mediaType" | "relativePath"
  >
): string {
  const mediaType = output.mediaType.toLowerCase()
  if (mediaType && mediaType !== "application/octet-stream") {
    return output.mediaType
  }

  switch (fileExtension(output.relativePath || output.filename)) {
    case "png":
      return "image/png"
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    case "gif":
      return "image/gif"
    case "webp":
      return "image/webp"
    case "svg":
      return "image/svg+xml"
    case "html":
    case "htm":
      return "text/html"
    case "json":
      return "application/json"
    case "md":
    case "markdown":
      return "text/markdown"
    case "txt":
    case "log":
      return "text/plain"
    default:
      return output.mediaType || "application/octet-stream"
  }
}

export function normalizeCloudOutputTarget(rawTarget: string): string | null {
  const trimmed = rawTarget.trim()
  if (!trimmed) return null

  if (/^(https?|mailto|tel):/i.test(trimmed)) return null

  if (/^file:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed)
      return normalizeOutputPath(decodeUriSafely(parsed.pathname))
    } catch {
      return null
    }
  }

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) return null
  return normalizeOutputPath(trimmed)
}

export function outputMatchesTarget(
  output: HouflowCloudSessionOutput,
  rawTarget: string
): boolean {
  const target = normalizeCloudOutputTarget(rawTarget)
  if (!target) return false
  const targetBase = basename(target)
  const candidates = [
    output.relativePath,
    output.filename,
    output.relativePath ? basename(output.relativePath) : null,
    basename(output.filename),
  ]
  return candidates.some((candidate) => {
    const normalized = candidate ? normalizeOutputPath(candidate) : null
    return (
      normalized === target ||
      (!!targetBase && normalized === targetBase) ||
      (!!normalized && target.endsWith(`/${normalized}`))
    )
  })
}

function fileExtension(path: string | null | undefined): string {
  const base = basename(path ?? "")
  const index = base.lastIndexOf(".")
  return index >= 0 ? base.slice(index + 1).toLowerCase() : ""
}

function basename(path: string): string {
  const normalized = normalizeOutputPath(path) ?? ""
  return normalized.split("/").filter(Boolean).pop() ?? normalized
}

function normalizeOutputPath(path: string): string | null {
  const stripped = path
    .replace(/[#?].*$/, "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim()
  if (!stripped) return null
  return decodeUriSafely(stripped).toLowerCase()
}

function decodeUriSafely(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
