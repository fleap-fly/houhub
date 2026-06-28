import { getTransport } from "@/lib/transport"

import {
  normalizeSpaceListing,
  normalizeSpacePresign,
  normalizeSpaceUsage,
  type WorkbenchSpaceListing,
  type WorkbenchSpacePresign,
  type WorkbenchSpaceUsage,
} from "./space-types"

// Client for the portal-neutral PS project space (the "digital asset center").
// The Rust backend holds the PS session token and injects both the desktop
// session header and the project-context header; this module only sequences
// calls and normalizes payloads. Bulk bytes (S3 GET/PUT) go directly from the
// webview to presigned URLs — the backend never streams file contents.

export type SpaceFileDisposition = "inline" | "attachment"

export async function listWorkbenchSpace(
  projectId: string,
  folderPath: string = "/",
  search?: string
): Promise<WorkbenchSpaceListing> {
  const raw = await getTransport().call("workbench_space_list", {
    projectId,
    folderPath,
    search: search ?? null,
  })
  return normalizeSpaceListing(raw)
}

export async function getWorkbenchSpaceUsage(
  projectId: string
): Promise<WorkbenchSpaceUsage> {
  const raw = await getTransport().call("workbench_space_usage", { projectId })
  return normalizeSpaceUsage(raw)
}

export async function getWorkbenchSpaceDownloadUrl(
  projectId: string,
  fileId: string,
  disposition: SpaceFileDisposition = "inline"
): Promise<string> {
  const raw = await getTransport().call<{ url?: string }>(
    "workbench_space_download_url",
    { projectId, fileId, disposition }
  )
  return typeof raw?.url === "string" ? raw.url : ""
}

export async function createWorkbenchSpaceFolder(
  projectId: string,
  folderName: string,
  parentId?: string
): Promise<void> {
  await getTransport().call("workbench_space_create_folder", {
    projectId,
    folderName,
    parentId: parentId ?? null,
  })
}

export async function deleteWorkbenchSpaceFile(
  projectId: string,
  fileId: string
): Promise<void> {
  await getTransport().call("workbench_space_delete_file", { projectId, fileId })
}

async function presignWorkbenchSpaceUpload(
  projectId: string,
  fileName: string,
  mimeType: string | null,
  size: number,
  folderPath?: string
): Promise<WorkbenchSpacePresign> {
  const raw = await getTransport().call("workbench_space_presign_upload", {
    projectId,
    fileName,
    mimeType: mimeType ?? null,
    size,
    folderPath: folderPath ?? null,
  })
  return normalizeSpacePresign(raw)
}

async function completeWorkbenchSpaceUpload(
  projectId: string,
  fileId: string,
  mimeType: string | null,
  folderPath?: string
): Promise<void> {
  await getTransport().call("workbench_space_complete_upload", {
    projectId,
    fileId,
    mimeType: mimeType ?? null,
    folderPath: folderPath ?? null,
  })
}

/**
 * Upload a file into the project space following PS's presigned flow:
 * presign → PUT bytes directly to storage → complete. PS enforces the project
 * storage quota during presign, so an over-quota upload rejects before any
 * bytes are transferred.
 */
export async function uploadWorkbenchSpaceFile(params: {
  projectId: string
  fileName: string
  data: Blob
  mimeType?: string | null
  folderPath?: string
}): Promise<void> {
  const mimeType = params.mimeType ?? params.data.type ?? null
  const presign = await presignWorkbenchSpaceUpload(
    params.projectId,
    params.fileName,
    mimeType,
    params.data.size,
    params.folderPath
  )
  if (!presign.uploadUrl || !presign.fileId) {
    throw new Error("Project System did not return a valid upload target")
  }

  const putResponse = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": presign.contentType },
    body: params.data,
  })
  if (!putResponse.ok) {
    throw new Error(`Upload failed with status ${putResponse.status}`)
  }

  await completeWorkbenchSpaceUpload(
    params.projectId,
    presign.fileId,
    mimeType,
    params.folderPath
  )
}
