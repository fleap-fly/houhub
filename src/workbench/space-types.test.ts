import { describe, expect, it } from "vitest"

import {
  normalizeSpaceEntry,
  normalizeSpaceListing,
  normalizeSpacePresign,
  normalizeSpaceUsage,
} from "./space-types"

describe("normalizeSpaceEntry", () => {
  it("maps PS snake_case payload into a camelCase entry", () => {
    const entry = normalizeSpaceEntry({
      id: "item-1",
      name: "report.xlsx",
      type: "file",
      size: 2048,
      mime_type: "application/vnd.ms-excel",
      path: "/finance",
      parent_id: null,
      created_at: "2026-06-23T00:00:00.000Z",
      updated_at: "2026-06-23T01:00:00.000Z",
      uploader_id: "u-1",
      uploader_name: "Finance",
      preview_available: true,
    })

    expect(entry).toEqual({
      id: "item-1",
      name: "report.xlsx",
      type: "file",
      size: 2048,
      mimeType: "application/vnd.ms-excel",
      path: "/finance",
      parentId: null,
      createdAt: "2026-06-23T00:00:00.000Z",
      updatedAt: "2026-06-23T01:00:00.000Z",
      uploaderId: "u-1",
      uploaderName: "Finance",
      previewAvailable: true,
    })
  })

  it("falls back to defaults for sparse rows and rejects rows without an id", () => {
    const sparse = normalizeSpaceEntry({ id: "x" })
    expect(sparse).toMatchObject({
      id: "x",
      name: "未命名",
      type: "file",
      path: "/",
      previewAvailable: true,
    })
    expect(normalizeSpaceEntry({})).toBeNull()
    expect(normalizeSpaceEntry(null)).toBeNull()
  })

  it("treats preview_available === false as not previewable", () => {
    expect(normalizeSpaceEntry({ id: "x", preview_available: false })?.previewAvailable).toBe(false)
  })
})

describe("normalizeSpaceListing", () => {
  it("splits folders/files, drops malformed rows, and maps current_folder", () => {
    const listing = normalizeSpaceListing({
      folders: [{ id: "f1", type: "folder", name: "Docs" }, { type: "folder" }],
      files: [{ id: "a1", type: "file", name: "a.pdf" }],
      current_folder: { id: "f1", type: "folder", name: "Docs" },
    })

    expect(listing.folders).toHaveLength(1)
    expect(listing.files).toHaveLength(1)
    expect(listing.currentFolder?.id).toBe("f1")
  })

  it("tolerates an empty/garbage payload", () => {
    expect(normalizeSpaceListing(undefined)).toEqual({
      folders: [],
      files: [],
      currentFolder: null,
    })
  })
})

describe("normalizeSpaceUsage", () => {
  it("coerces missing fields to zero", () => {
    expect(normalizeSpaceUsage({ used: 10, total: 100, percentage: 10 })).toEqual({
      used: 10,
      total: 100,
      percentage: 10,
    })
    expect(normalizeSpaceUsage(null)).toEqual({ used: 0, total: 0, percentage: 0 })
  })
})

describe("normalizeSpacePresign", () => {
  it("maps the presign payload and defaults the content type", () => {
    expect(
      normalizeSpacePresign({
        file_id: "file-1",
        upload_url: "https://s3/put",
        expires_in_seconds: 300,
      })
    ).toEqual({
      fileId: "file-1",
      uploadUrl: "https://s3/put",
      contentType: "application/octet-stream",
      expiresInSeconds: 300,
    })
  })
})
