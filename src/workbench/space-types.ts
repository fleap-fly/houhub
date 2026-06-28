// Types for the PS project-space ("digital asset center") data layer.
//
// A PS project space is a single shared source of truth. It is portal-neutral:
// management users (e.g. finance) and business users (e.g. store managers) see
// the same space, gated only by project membership. The Rust backend proxies
// the PS HTTP surface and returns its payload as-is (snake_case); this module
// normalizes it into camelCase entries for the React layer.

export type WorkbenchSpaceEntryType = "file" | "folder"

export interface WorkbenchSpaceEntry {
  id: string
  name: string
  type: WorkbenchSpaceEntryType
  size: number | null
  mimeType: string | null
  /** Logical folder path the entry lives under (defaults to "/"). */
  path: string
  parentId: string | null
  createdAt: string | null
  updatedAt: string | null
  uploaderId: string | null
  uploaderName: string | null
  previewAvailable: boolean
}

export interface WorkbenchSpaceListing {
  folders: WorkbenchSpaceEntry[]
  files: WorkbenchSpaceEntry[]
  currentFolder: WorkbenchSpaceEntry | null
}

export interface WorkbenchSpaceUsage {
  /** Bytes currently used by the project space. */
  used: number
  /** Total bytes available (project storage quota); 0 when unbounded/unset. */
  total: number
  /** Used/total as a percentage (0–100), rounded to 2 decimals. */
  percentage: number
}

export interface WorkbenchSpacePresign {
  fileId: string
  uploadUrl: string
  contentType: string
  expiresInSeconds: number
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function normalizeSpaceEntry(raw: unknown): WorkbenchSpaceEntry | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const id = asString(r.id)
  if (!id) return null
  return {
    id,
    name: asString(r.name) ?? "未命名",
    type: r.type === "folder" ? "folder" : "file",
    size: asNumber(r.size),
    mimeType: asString(r.mime_type),
    path: asString(r.path) ?? "/",
    parentId: asString(r.parent_id),
    createdAt: asString(r.created_at),
    updatedAt: asString(r.updated_at),
    uploaderId: asString(r.uploader_id),
    uploaderName: asString(r.uploader_name),
    previewAvailable: r.preview_available !== false,
  }
}

export function normalizeSpaceListing(raw: unknown): WorkbenchSpaceListing {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const folders = Array.isArray(r.folders)
    ? r.folders.map(normalizeSpaceEntry).filter((x): x is WorkbenchSpaceEntry => x !== null)
    : []
  const files = Array.isArray(r.files)
    ? r.files.map(normalizeSpaceEntry).filter((x): x is WorkbenchSpaceEntry => x !== null)
    : []
  return {
    folders,
    files,
    currentFolder: normalizeSpaceEntry(r.current_folder),
  }
}

export function normalizeSpaceUsage(raw: unknown): WorkbenchSpaceUsage {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  return {
    used: asNumber(r.used) ?? 0,
    total: asNumber(r.total) ?? 0,
    percentage: asNumber(r.percentage) ?? 0,
  }
}

export function normalizeSpacePresign(raw: unknown): WorkbenchSpacePresign {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  return {
    fileId: asString(r.file_id) ?? "",
    uploadUrl: asString(r.upload_url) ?? "",
    contentType: asString(r.content_type) ?? "application/octet-stream",
    expiresInSeconds: asNumber(r.expires_in_seconds) ?? 0,
  }
}
