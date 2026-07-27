import { create } from "zustand"

export type WorkspaceResourceSection = "local" | "cloud" | "suites"

interface WorkspaceResourceStoreState {
  activeSection: WorkspaceResourceSection
  setActiveSection: (section: WorkspaceResourceSection) => void
}

export const useWorkspaceResourceStore = create<WorkspaceResourceStoreState>()(
  (set) => ({
    activeSection: "local",
    setActiveSection: (activeSection) => set({ activeSection }),
  })
)
