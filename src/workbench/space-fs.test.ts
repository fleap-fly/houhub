import { beforeEach, describe, expect, it, vi } from "vitest"

import type { WorkbenchSpaceListing } from "./space-types"

const listWorkbenchSpace = vi.fn()
const getWorkbenchSpaceDownloadUrl = vi.fn()

vi.mock("./space", () => ({
  listWorkbenchSpace: (...args: unknown[]) => listWorkbenchSpace(...args),
  getWorkbenchSpaceDownloadUrl: (...args: unknown[]) =>
    getWorkbenchSpaceDownloadUrl(...args),
  uploadWorkbenchSpaceFile: vi.fn(),
  createWorkbenchSpaceFolder: vi.fn(),
  deleteWorkbenchSpaceFile: vi.fn(),
}))

import {
  isPsPath,
  parsePsPath,
  psGetFileTree,
  psReadFileBase64,
  psReadWorkspaceFileBase64,
  psRootPath,
} from "./space-fs"

function entry(name: string, type: "file" | "folder") {
  return {
    id: `${type}:${name}`,
    name,
    type,
    size: null,
    mimeType: null,
    path: "/",
    parentId: null,
    createdAt: null,
    updatedAt: null,
    uploaderId: null,
    uploaderName: null,
    previewAvailable: type === "file",
  }
}

function listing(folders: string[], files: string[]): WorkbenchSpaceListing {
  return {
    folders: folders.map((n) => entry(n, "folder")),
    files: files.map((n) => entry(n, "file")),
    currentFolder: null,
  }
}

describe("isPsPath / psRootPath", () => {
  it("recognizes and builds ps:// roots", () => {
    expect(psRootPath("proj-1")).toBe("ps://proj-1")
    expect(isPsPath("ps://proj-1")).toBe(true)
    expect(isPsPath("ps://proj-1/finance")).toBe(true)
    expect(isPsPath("/Users/me/proj")).toBe(false)
    expect(isPsPath(null)).toBe(false)
  })
})

describe("parsePsPath", () => {
  it("parses the root and nested folder paths", () => {
    expect(parsePsPath("ps://proj-1")).toEqual({
      projectId: "proj-1",
      folderPath: "/",
    })
    expect(parsePsPath("ps://proj-1/finance")).toEqual({
      projectId: "proj-1",
      folderPath: "/finance",
    })
    expect(parsePsPath("ps://proj-1/finance/q1/")).toEqual({
      projectId: "proj-1",
      folderPath: "/finance/q1",
    })
  })
})

describe("psGetFileTree", () => {
  beforeEach(() => {
    listWorkbenchSpace.mockReset()
  })

  it("lists the root with depth 1 (no recursion) and folder-then-file order", async () => {
    listWorkbenchSpace.mockResolvedValueOnce(
      listing(["finance"], ["readme.md"])
    )

    const tree = await psGetFileTree("ps://proj-1", 1)

    expect(listWorkbenchSpace).toHaveBeenCalledWith("proj-1", "/")
    expect(tree).toEqual([
      { kind: "dir", name: "finance", path: "finance", children: [] },
      { kind: "file", name: "readme.md", path: "readme.md" },
    ])
  })

  it("recurses with root-relative paths when depth > 1", async () => {
    listWorkbenchSpace
      .mockResolvedValueOnce(listing(["finance"], []))
      .mockResolvedValueOnce(listing([], ["q1.xlsx"]))

    const tree = await psGetFileTree("ps://proj-1", 2)

    expect(listWorkbenchSpace).toHaveBeenNthCalledWith(1, "proj-1", "/")
    expect(listWorkbenchSpace).toHaveBeenNthCalledWith(2, "proj-1", "/finance")
    expect(tree).toEqual([
      {
        kind: "dir",
        name: "finance",
        path: "finance",
        children: [{ kind: "file", name: "q1.xlsx", path: "finance/q1.xlsx" }],
      },
    ])
  })
})

describe("project-space file bytes", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    listWorkbenchSpace.mockReset()
    getWorkbenchSpaceDownloadUrl.mockReset()
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  it("reads a ps:// file through a presigned URL as base64", async () => {
    listWorkbenchSpace.mockResolvedValueOnce(listing([], ["exam.png"]))
    getWorkbenchSpaceDownloadUrl.mockResolvedValueOnce(
      "https://cdn.test/exam.png"
    )
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), { status: 200 })
    )

    const result = await psReadFileBase64("ps://proj-1/outputs/exam.png")

    expect(listWorkbenchSpace).toHaveBeenCalledWith("proj-1", "/outputs")
    expect(getWorkbenchSpaceDownloadUrl).toHaveBeenCalledWith(
      "proj-1",
      "file:exam.png",
      "inline"
    )
    expect(result).toBe("AQID")
  })

  it("reads relative HTML resources from a project-space preview root", async () => {
    listWorkbenchSpace.mockResolvedValueOnce(listing([], ["cover.png"]))
    getWorkbenchSpaceDownloadUrl.mockResolvedValueOnce(
      "https://cdn.test/cover.png"
    )
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([4, 5, 6]), { status: 200 })
    )

    const result = await psReadWorkspaceFileBase64(
      "ps://proj-1/outputs",
      "cover.png"
    )

    expect(listWorkbenchSpace).toHaveBeenCalledWith("proj-1", "/outputs")
    expect(result).toBe("BAUG")
  })
})
