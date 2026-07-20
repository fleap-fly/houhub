"use client"

import { create } from "zustand"

import { detectPlatform } from "@/hooks/use-platform"
import { isDesktop } from "@/lib/platform"
import {
  loadPersistedPanelState,
  savePersistedPanelState,
} from "@/lib/panel-state-storage"

export type AuxPanelTab =
  | "session_details"
  | "workspace_resources"
  | "file_tree"
  | "changes"
  | "git_log"
  | "runtime_logs"

interface AuxPanelStoreState {
  isOpen: boolean
  restored: boolean
  width: number
  minWidth: number
  maxWidth: number
  activeTab: AuxPanelTab
  pendingRevealPath: string | null
  hydrate: () => void
  toggle: () => void
  setOpen: (open: boolean) => void
  setWidth: (width: number) => void
  setActiveTab: (tab: AuxPanelTab) => void
  openTab: (tab: AuxPanelTab) => void
  revealInFileTree: (path: string) => void
  consumePendingRevealPath: () => void
  resetPendingRevealPath: () => void
}

const STORAGE_KEY = "workspace:right-sidebar"
const DEFAULT_WIDTH = 320
const BASE_MIN_WIDTH = 200
const DESKTOP_CAPTION_MIN_WIDTH = 260
const MAX_WIDTH = 900
const DEFAULT_IS_OPEN = false

function resolveMinWidth(): number {
  const platform = detectPlatform()
  return isDesktop() && (platform === "windows" || platform === "linux")
    ? DESKTOP_CAPTION_MIN_WIDTH
    : BASE_MIN_WIDTH
}

function clampWidth(width: number, minWidth: number): number {
  return Math.max(minWidth, Math.min(MAX_WIDTH, width))
}

export const useAuxPanelStore = create<AuxPanelStoreState>()((set, get) => {
  const persist = () => {
    const state = get()
    if (!state.restored) return
    savePersistedPanelState(STORAGE_KEY, {
      isOpen: state.isOpen,
      width: state.width,
    })
  }

  return {
    isOpen: DEFAULT_IS_OPEN,
    restored: false,
    width: DEFAULT_WIDTH,
    minWidth: BASE_MIN_WIDTH,
    maxWidth: MAX_WIDTH,
    activeTab: "session_details",
    pendingRevealPath: null,

    hydrate: () => {
      if (get().restored || typeof window === "undefined") return
      const minWidth = resolveMinWidth()
      const stored = loadPersistedPanelState(STORAGE_KEY)
      const isMobileViewport = window.innerWidth < 768
      set({
        isOpen: isMobileViewport ? false : (stored?.isOpen ?? DEFAULT_IS_OPEN),
        width: clampWidth(stored?.width ?? DEFAULT_WIDTH, minWidth),
        minWidth,
        restored: true,
      })
    },
    toggle: () => {
      set((state) => ({ isOpen: !state.isOpen }))
      persist()
    },
    setOpen: (isOpen) => {
      set({ isOpen })
      persist()
    },
    setWidth: (width) => {
      set({ width: clampWidth(width, get().minWidth) })
      persist()
    },
    setActiveTab: (activeTab) => set({ activeTab }),
    openTab: (activeTab) => {
      set({ activeTab, isOpen: true })
      persist()
    },
    revealInFileTree: (path) => {
      set({ pendingRevealPath: path, activeTab: "file_tree", isOpen: true })
      persist()
    },
    consumePendingRevealPath: () => set({ pendingRevealPath: null }),
    resetPendingRevealPath: () => set({ pendingRevealPath: null }),
  }
})
