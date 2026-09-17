import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const layoutSource = readFileSync(
  resolve(process.cwd(), "src/app/layout.tsx"),
  "utf8"
)

/** Every component the root layout is expected to mount exactly once. */
const SINGLETON_PROVIDERS = [
  "NextIntlClientProvider",
  "AppI18nProvider",
  "ThemeProvider",
  "AppearanceProvider",
  "HouflowDesktopProvider",
  "WorkbenchProvider",
] as const

/** Global children that must be mounted once per window, not per render pass. */
const SINGLETON_MOUNTS = [
  "WorkbenchClientCapabilityProvider",
  "OverlayScrollbarsInit",
  "ClipboardFallbackInit",
  "WebConnectionGuard",
  "WindowResizeGrips",
  "CloseRequestDialog",
] as const

describe("root layout structure", () => {
  // A union merge during an upstream sync appended the whole provider stack a
  // second time, so `{children}` rendered twice in the same tree. Every page
  // mounts its own full-height frame (`h-screen` / `overflow-hidden`), so two
  // copies made the document 200vh tall and the settings pages — whose content
  // is the tallest — scrolled at the window level instead of inside their
  // panels. It also ran every global listener and IPC subscription twice.
  //
  // Nothing else caught it: each copy is individually valid JSX, TypeScript is
  // happy, and the duplicate stack is invisible to a snapshot of any single
  // component. So the assertion is structural — one render of `{children}` and
  // exactly one mount of each singleton.
  it("renders children exactly once", () => {
    const occurrences = layoutSource.match(/\{children\}/g) ?? []

    expect(occurrences).toHaveLength(1)
  })

  it.each([...SINGLETON_PROVIDERS, ...SINGLETON_MOUNTS])(
    "mounts %s exactly once",
    (component) => {
      const mounted = layoutSource.match(
        new RegExp(`<${component}(?=[\\s/>])`, "g")
      )

      expect(mounted).toHaveLength(1)
    }
  )
})
