// Adapter that lets a mounted PS project space (`ps://<projectId>`) be browsed
// and edited through houhub's existing file UI. The file UI is path-based while
// PS is id-based, so these helpers resolve ids by listing the parent folder and
// matching by name. Bulk bytes flow directly to presigned URLs via the space
// client; the backend never streams file contents.
//
// Path model:
// - A folder root is `ps://<projectId>` (PS folder_path "/").
// - `getFileTree` is called with the folder to list; returned node paths are
//   RELATIVE to that folder (matching the local `get_file_tree` contract).
// - read/save/delete receive `rootPath = ps://<projectId>` plus a path that is
//   relative to the root (e.g. "finance/q1/report.xlsx").

import type { FileEditContent, FilePreviewContent, FileSaveResult, FileTreeNode } from "@/lib/types"

import {
  createWorkbenchSpaceFolder,
  deleteWorkbenchSpaceFile,
  getWorkbenchSpaceDownloadUrl,
  listWorkbenchSpace,
  uploadWorkbenchSpaceFile,
} from "./space"

const PS_SCHEME = "ps://"
/** Initial tree depth when no explicit depth is requested (mirrors the local workspace tree). */
const DEFAULT_TREE_DEPTH = 2

export function isPsPath(path: string | null | undefined): path is string {
  return typeof path === "string" && path.startsWith(PS_SCHEME)
}

/** Synthetic root path for a mounted project space. */
export function psRootPath(projectId: string): string {
  return `${PS_SCHEME}${projectId}`
}

interface PsLocation {
  projectId: string
  /** PS folder path, always "/"-prefixed and without a trailing slash (root === "/"). */
  folderPath: string
}

function normalizeFolderPath(raw: string): string {
  const collapsed = raw.replace(/\\/g, "/").replace(/\/+/g, "/")
  const trimmed = collapsed.replace(/\/+$/, "")
  if (!trimmed || trimmed === "") return "/"
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`
}

/** Parse a `ps://<projectId>[/<folderPath>]` path (used for folders / tree roots). */
export function parsePsPath(path: string): PsLocation {
  const rest = path.slice(PS_SCHEME.length)
  const slash = rest.indexOf("/")
  if (slash === -1) return { projectId: rest, folderPath: "/" }
  return {
    projectId: rest.slice(0, slash),
    folderPath: normalizeFolderPath(rest.slice(slash)),
  }
}

/** Split a root-relative path into its PS folder path + file/entry name. */
function splitRootRelative(rel: string): { folderPath: string; name: string } {
  const normalized = rel.replace(/\\/g, "/").replace(/^\/+/, "")
  const slash = normalized.lastIndexOf("/")
  if (slash === -1) return { folderPath: "/", name: normalized }
  return {
    folderPath: normalizeFolderPath(normalized.slice(0, slash)),
    name: normalized.slice(slash + 1),
  }
}

function joinFolder(folderPath: string, name: string): string {
  return folderPath === "/" ? `/${name}` : `${folderPath}/${name}`
}

function joinRel(prefix: string, name: string): string {
  return prefix ? `${prefix}/${name}` : name
}

async function buildTree(
  projectId: string,
  folderPath: string,
  relPrefix: string,
  depth: number
): Promise<FileTreeNode[]> {
  const listing = await listWorkbenchSpace(projectId, folderPath)
  const nodes: FileTreeNode[] = []
  for (const folder of listing.folders) {
    const rel = joinRel(relPrefix, folder.name)
    const children =
      depth > 1
        ? await buildTree(projectId, joinFolder(folderPath, folder.name), rel, depth - 1)
        : []
    nodes.push({ kind: "dir", name: folder.name, path: rel, children })
  }
  for (const file of listing.files) {
    nodes.push({ kind: "file", name: file.name, path: joinRel(relPrefix, file.name) })
  }
  return nodes
}

export async function psGetFileTree(
  path: string,
  maxDepth?: number
): Promise<FileTreeNode[]> {
  const { projectId, folderPath } = parsePsPath(path)
  return buildTree(projectId, folderPath, "", maxDepth ?? DEFAULT_TREE_DEPTH)
}

async function resolveFileId(
  projectId: string,
  folderPath: string,
  name: string
): Promise<{ id: string; mimeType: string | null; updatedAt: string | null } | null> {
  const listing = await listWorkbenchSpace(projectId, folderPath)
  const match =
    listing.files.find((f) => f.name === name) ??
    listing.folders.find((f) => f.name === name)
  return match
    ? { id: match.id, mimeType: match.mimeType, updatedAt: match.updatedAt }
    : null
}

async function fetchProjectSpaceFileBytes(
  projectId: string,
  path: string,
  maxBytes?: number
): Promise<ArrayBuffer> {
  const { folderPath, name } = splitRootRelative(path)
  const file = await resolveFileId(projectId, folderPath, name)
  if (!file) throw new Error(`项目空间中找不到文件：${path}`)
  const url = await getWorkbenchSpaceDownloadUrl(projectId, file.id, "inline")
  if (!url) throw new Error("项目空间未返回下载地址")
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`读取项目空间文件失败（HTTP ${response.status}）`)
  }
  const buffer = await response.arrayBuffer()
  if (maxBytes != null && maxBytes > 0 && buffer.byteLength > maxBytes) {
    throw new Error(`项目空间文件超过预览大小限制：${buffer.byteLength} bytes`)
  }
  return buffer
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  if (typeof btoa === "function") return btoa(binary)
  return Buffer.from(binary, "binary").toString("base64")
}

export async function psReadFileBase64(
  path: string,
  maxBytes?: number
): Promise<string> {
  const { projectId, folderPath } = parsePsPath(path)
  if (folderPath === "/") throw new Error(`项目空间中找不到文件：${path}`)
  const buffer = await fetchProjectSpaceFileBytes(
    projectId,
    folderPath.replace(/^\/+/, ""),
    maxBytes
  )
  return arrayBufferToBase64(buffer)
}

export async function psReadWorkspaceFileBase64(
  rootPath: string,
  path: string,
  maxBytes?: number
): Promise<string> {
  const { projectId, folderPath } = parsePsPath(rootPath)
  const rootRelative =
    folderPath === "/"
      ? path
      : `${folderPath.replace(/^\/+/, "")}/${path.replace(/^\/+/, "")}`
  const buffer = await fetchProjectSpaceFileBytes(projectId, rootRelative, maxBytes)
  return arrayBufferToBase64(buffer)
}

export async function psReadFileForEdit(
  rootPath: string,
  path: string
): Promise<FileEditContent> {
  const { projectId } = parsePsPath(rootPath)
  const { folderPath, name } = splitRootRelative(path)
  const file = await resolveFileId(projectId, folderPath, name)
  if (!file) throw new Error(`项目空间中找不到文件：${path}`)
  const url = await getWorkbenchSpaceDownloadUrl(projectId, file.id, "inline")
  if (!url) throw new Error("项目空间未返回下载地址")
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`读取项目空间文件失败（HTTP ${response.status}）`)
  }
  const content = await response.text()
  return {
    path,
    content,
    etag: file.updatedAt ?? "",
    mtime_ms: null,
    readonly: false,
    line_ending: "lf",
  }
}

export async function psReadFilePreview(
  rootPath: string,
  path: string
): Promise<FilePreviewContent> {
  const edit = await psReadFileForEdit(rootPath, path)
  return { path: edit.path, content: edit.content }
}

export async function psSaveFileContent(
  rootPath: string,
  path: string,
  content: string
): Promise<FileSaveResult> {
  const { projectId } = parsePsPath(rootPath)
  const { folderPath, name } = splitRootRelative(path)
  await uploadWorkbenchSpaceFile({
    projectId,
    fileName: name,
    data: new Blob([content], { type: "text/plain" }),
    mimeType: "text/plain",
    folderPath,
  })
  return { path, etag: "", mtime_ms: null, readonly: false, line_ending: "lf" }
}

export async function psCreateEntry(
  rootPath: string,
  path: string,
  name: string,
  kind: "file" | "dir"
): Promise<string> {
  const { projectId } = parsePsPath(rootPath)
  const parentFolderPath = path ? normalizeFolderPath(path) : "/"

  if (kind === "dir") {
    let parentId: string | undefined
    if (parentFolderPath !== "/") {
      const parentSplit = splitRootRelative(path)
      const resolved = await resolveFileId(
        projectId,
        parentSplit.folderPath,
        parentSplit.name
      )
      parentId = resolved?.id
    }
    await createWorkbenchSpaceFolder(projectId, name, parentId)
    return joinRel(path, name)
  }

  // PS rejects zero-byte uploads, so a "new file" is seeded with a newline; the
  // user's first save replaces it via the normal upload flow.
  await uploadWorkbenchSpaceFile({
    projectId,
    fileName: name,
    data: new Blob(["\n"], { type: "text/plain" }),
    mimeType: "text/plain",
    folderPath: parentFolderPath,
  })
  return joinRel(path, name)
}

export async function psDeleteEntry(rootPath: string, path: string): Promise<void> {
  const { projectId } = parsePsPath(rootPath)
  const { folderPath, name } = splitRootRelative(path)
  const entry = await resolveFileId(projectId, folderPath, name)
  if (!entry) return
  await deleteWorkbenchSpaceFile(projectId, entry.id)
}
