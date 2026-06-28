import { beforeEach, describe, expect, it, vi } from "vitest"

import type { WorkbenchSpaceListing } from "./space-types"

const listWorkbenchSpace = vi.fn()

vi.mock("./space", () => ({
  listWorkbenchSpace: (...args: unknown[]) => listWorkbenchSpace(...args),
  getWorkbenchSpaceDownloadUrl: vi.fn(),
  uploadWorkbenchSpaceFile: vi.fn(),
  createWorkbenchSpaceFolder: vi.fn(),
  deleteWorkbenchSpaceFile: vi.fn(),
}))

import { isPsPath, parsePsPath, psGetFileTree, psRootPath } from "./space-fs"

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

function listing(
  folders: string[],
  files: string[]
): WorkbenchSpaceListing {
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
    expect(parsePsPath("ps://proj-1")).toEqual({ projectId: "proj-1", folderPath: "/" })
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
    listWorkbenchSpace.mockResolvedValueOnce(listing(["finance"], ["readme.md"]))

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
