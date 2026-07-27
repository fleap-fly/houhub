"use client"

import { useEffect, useState, type CSSProperties } from "react"

import { usePlatform } from "@/hooks/use-platform"
import { isDesktop } from "@/lib/platform"

import { WINDOW_CONTROLS_WIDTH } from "./window-controls"

type ResizeDir =
  | "North"
  | "South"
  | "East"
  | "West"
  | "NorthWest"
  | "SouthWest"
  | "SouthEast"

const EDGE = 4
const CORNER = 14
const CONTROLS_HEIGHT = "2rem"

async function beginResize(dir: ResizeDir) {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window")
    await getCurrentWindow().startResizeDragging(dir)
  } catch (err) {
    console.error("[WindowResizeGrips] startResizeDragging failed:", err)
  }
}

const GRIPS: { dir: ResizeDir; cursor: string; style: CSSProperties }[] = [
  {
    dir: "North",
    cursor: "ns-resize",
    style: { top: 0, left: 0, right: WINDOW_CONTROLS_WIDTH, height: EDGE },
  },
  {
    dir: "South",
    cursor: "ns-resize",
    style: { bottom: 0, left: 0, right: 0, height: EDGE },
  },
  {
    dir: "West",
    cursor: "ew-resize",
    style: { top: 0, bottom: 0, left: 0, width: EDGE },
  },
  {
    dir: "East",
    cursor: "ew-resize",
    style: { top: CONTROLS_HEIGHT, bottom: 0, right: 0, width: EDGE },
  },
  {
    dir: "NorthWest",
    cursor: "nwse-resize",
    style: { top: 0, left: 0, width: CORNER, height: CORNER },
  },
  {
    dir: "SouthWest",
    cursor: "nesw-resize",
    style: { bottom: 0, left: 0, width: CORNER, height: CORNER },
  },
  {
    dir: "SouthEast",
    cursor: "nwse-resize",
    style: { bottom: 0, right: 0, width: CORNER, height: CORNER },
  },
]

export function WindowResizeGrips() {
  const { isLinux } = usePlatform()
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    if (!isLinux || !isDesktop()) {
      setEnabled(false)
      return
    }

    let disposed = false
    let unlisten: (() => void) | null = null

    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      if (disposed) return
      const appWindow = getCurrentWindow()

      let resizable = true
      try {
        resizable = await appWindow.isResizable()
      } catch {
        resizable = true
      }
      if (disposed || !resizable) {
        setEnabled(false)
        return
      }

      const sync = async () => {
        try {
          const maximized = await appWindow.isMaximized()
          if (!disposed) setEnabled(!maximized)
        } catch {
          if (!disposed) setEnabled(true)
        }
      }

      await sync()
      appWindow
        .onResized(() => void sync())
        .then((u) => {
          if (disposed) u()
          else unlisten = u
        })
        .catch(() => {
          unlisten = null
        })
    })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [isLinux])

  if (!enabled) return null

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[100]">
      {GRIPS.map((grip) => (
        <div
          key={grip.dir}
          className="pointer-events-auto absolute"
          style={{ ...grip.style, cursor: grip.cursor }}
          onMouseDown={(event) => {
            if (event.button !== 0) return
            event.preventDefault()
            void beginResize(grip.dir)
          }}
        />
      ))}
    </div>
  )
}
