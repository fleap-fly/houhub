"use client"

import { useCallback } from "react"
import {
  EllipsisVertical,
  Menu,
  PanelRight,
  Settings,
  SquareTerminal,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { openSettingsWindow } from "@/lib/api"
import { useActiveFolder } from "@/contexts/active-folder-context"
import { Button } from "@/components/ui/button"
import { useSidebarContext } from "@/contexts/sidebar-context"
import { useAuxPanelStore } from "@/stores/aux-panel-store"
import { useTerminalContext } from "@/contexts/terminal-context"
import { AppTitleBar } from "./app-title-bar"
import { NewFolderDropdown } from "./new-folder-dropdown"
import { RemoteWorkspaceDropdown } from "./remote-workspace-dropdown"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/** Mobile workspace title bar; desktop chrome lives in the four columns. */
export function FolderTitleBar() {
  const tTitleBar = useTranslations("Folder.folderTitleBar")
  const { toggle } = useSidebarContext()
  const toggleAuxPanel = useAuxPanelStore((state) => state.toggle)
  const { toggle: toggleTerminal } = useTerminalContext()
  const { activeFolder } = useActiveFolder()

  const handleOpenSettings = useCallback(() => {
    openSettingsWindow().catch((err) => {
      console.error("[FolderTitleBar] failed to open settings:", err)
    })
  }, [])

  return (
    <AppTitleBar
      left={
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={toggle}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <NewFolderDropdown />
          <RemoteWorkspaceDropdown />
        </div>
      }
      right={
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <EllipsisVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={toggleAuxPanel}>
                <PanelRight className="h-3.5 w-3.5" />
                {tTitleBar("toggleAuxPanel")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => toggleTerminal()}
                disabled={!activeFolder}
              >
                <SquareTerminal className="h-3.5 w-3.5" />
                {tTitleBar("toggleTerminal")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleOpenSettings}>
                <Settings className="h-3.5 w-3.5" />
                {tTitleBar("openSettings")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    />
  )
}
