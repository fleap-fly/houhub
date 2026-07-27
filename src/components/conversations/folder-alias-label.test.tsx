import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { FolderAliasLabel } from "./folder-alias-label"

describe("FolderAliasLabel", () => {
  it("renders `alias [ name ]` with the bracketed name in a deeper-color span", () => {
    const { container } = render(
      <FolderAliasLabel name="houhub" alias="My Project" />
    )
    expect(container.textContent).toBe("My Project [ houhub ]")
    const bracket = container.querySelector("span")
    expect(bracket?.textContent).toBe("[ houhub ]")
    // Default (fallback) bracket color is a neutral foreground shade, not accent.
    expect(bracket?.className).toContain("text-foreground")
    expect(bracket?.className).not.toContain("text-primary")
  })

  it("renders just the name (no span) when there is no alias", () => {
    const { container } = render(
      <FolderAliasLabel name="houhub" alias={null} />
    )
    expect(container.textContent).toBe("houhub")
    expect(container.querySelector("span")).toBeNull()
  })

  it("treats a whitespace-only alias as unset", () => {
    const { container } = render(<FolderAliasLabel name="houhub" alias="   " />)
    expect(container.textContent).toBe("houhub")
    expect(container.querySelector("span")).toBeNull()
  })

  it("lets a bracketClassName override the accent color", () => {
    const { container } = render(
      <FolderAliasLabel
        name="houhub"
        alias="X"
        bracketClassName="text-muted-foreground"
      />
    )
    expect(container.querySelector("span")?.className).toContain(
      "text-muted-foreground"
    )
  })
})
