"use client"

import { useCallback, useEffect, useState } from "react"
import {
  EllipsisVertical,
  Menu,
  PanelLeft,
  PanelRight,
  PawPrint,
  Settings,
  SquareTerminal,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { openSettingsWindow } from "@/lib/api"
import { getPetSettings, openPetWindow } from "@/lib/pet/api"
import { useAppWorkspace } from "@/contexts/app-workspace-context"
import { useActiveFolder } from "@/contexts/active-folder-context"
import { useIsActiveChatMode } from "@/hooks/use-is-active-chat-mode"
import { isDesktop, openFileDialog } from "@/lib/platform"
import { getActiveRemoteConnectionId } from "@/lib/transport"
import { Button } from "@/components/ui/button"
import { useSidebarContext } from "@/contexts/sidebar-context"
import { useAuxPanelContext } from "@/contexts/aux-panel-context"
import { useTerminalContext } from "@/contexts/terminal-context"
import { useTabContext } from "@/contexts/tab-context"
import { useWorkspaceView } from "@/contexts/workspace-context"
import { useWorkbenchRoute } from "@/contexts/workbench-route-context"
import { useSearchDialog } from "@/contexts/search-dialog-context"
import { useIsMac } from "@/hooks/use-is-mac"
import { useShortcutSettings } from "@/hooks/use-shortcut-settings"
import {
  formatShortcutLabel,
  matchShortcutEvent,
} from "@/lib/keyboard-shortcuts"
import { AppTitleBar } from "./app-title-bar"
import { HouflowAccountButton } from "./houflow-account-button"
import { WorkbenchAccountButton } from "./workbench-account-button"
import { NewFolderDropdown } from "./new-folder-dropdown"
import { RemoteWorkspaceDropdown } from "./remote-workspace-dropdown"
import { TabBar } from "@/components/tabs/tab-bar"
import { FileWorkspaceTabBar } from "@/components/files/file-workspace-tab-bar"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { SearchCommandDialog } from "@/components/conversations/search-command-dialog"
import { DirectoryBrowserDialog } from "@/components/shared/directory-browser-dialog"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function FolderTitleBar() {
  const tTitleBar = useTranslations("Folder.folderTitleBar")
  const tPet = useTranslations("Pet")
  const { openFolder } = useAppWorkspace()
  const { activeFolder } = useActiveFolder()
  const isChatMode = useIsActiveChatMode()
  // Low-frequency subscription for the relocated tab strips: `mode` only flips
  // on fusion/pane/maximize changes (never on streaming/keystroke churn). It
  // decides whether the file tab strip + its resizable split are shown.
  const { mode } = useWorkspaceView()
  const { isOpen, toggle } = useSidebarContext()
  const {
    isOpen: auxPanelOpen,
    toggle: toggleAuxPanel,
    openTab: openAuxPanelTab,
  } = useAuxPanelContext()
  const { isOpen: terminalOpen, toggle: toggleTerminal } = useTerminalContext()
  const { openNewConversationTab } = useTabContext()
  const { isConversations, openConversations, routeId } = useWorkbenchRoute()
  const showLocalWorkspaceChrome = isConversations
  const isCloudRoute = routeId === "cloud"
  const isMac = useIsMac()
  const { shortcuts } = useShortcutSettings()
  const localWorkspaceToolDisabled = !showLocalWorkspaceChrome || !activeFolder
  const auxPanelToggleDisabled =
    !auxPanelOpen &&
    !isCloudRoute &&
    (!showLocalWorkspaceChrome || !activeFolder)
  // Search open-state is shared (see search-dialog-context): the trigger now
  // lives in the sidebar, but this always-mounted bar keeps owning the dialog
  // and the ⌘K shortcut so search works even when the sidebar is collapsed.
  const { open: searchOpen, setOpen: setSearchOpen } = useSearchDialog()
  const [browserOpen, setBrowserOpen] = useState(false)

  const handleOpenPet = useCallback(async () => {
    if (!isDesktop()) return
    try {
      const settings = await getPetSettings()
      if (!settings.activePetId) {
        await openSettingsWindow("appearance")
        return
      }
      await openPetWindow()
    } catch {
      // No active pet or window error — route the user to the manager.
      try {
        await openSettingsWindow("appearance")
      } catch (err) {
        console.warn("[Pet] open settings failed:", err)
      }
    }
  }, [])

  const handleOpenFolder = useCallback(async () => {
    // See NewFolderDropdown / SidebarConversationList for the same logic:
    // the native Tauri dialog browses the LOCAL filesystem, so when the
    // user is bound to a remote workspace we must fall through to the
    // in-app DirectoryBrowserDialog (which browses the remote host via
    // the proxied `list_directory_entries`).
    if (isDesktop() && getActiveRemoteConnectionId() === null) {
      try {
        const result = await openFileDialog({
          directory: true,
          multiple: false,
        })
        if (!result) return
        const selected = Array.isArray(result) ? result[0] : result
        await openFolder(selected)
      } catch (err) {
        console.error("[FolderTitleBar] failed to open folder:", err)
      }
    } else {
      setBrowserOpen(true)
    }
  }, [openFolder])

  const handleOpenSettings = useCallback(() => {
    openSettingsWindow().catch((err) => {
      console.error("[FolderTitleBar] failed to open settings:", err)
    })
  }, [])

  const handleToggleAuxPanel = useCallback(() => {
    if (isCloudRoute && !auxPanelOpen) {
      openAuxPanelTab("file_tree")
      return
    }
    toggleAuxPanel()
  }, [auxPanelOpen, isCloudRoute, openAuxPanelTab, toggleAuxPanel])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (matchShortcutEvent(e, shortcuts.toggle_search)) {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
        return
      }
      if (matchShortcutEvent(e, shortcuts.toggle_sidebar)) {
        e.preventDefault()
        toggle()
        return
      }
      if (matchShortcutEvent(e, shortcuts.toggle_terminal)) {
        if (!showLocalWorkspaceChrome) return
        e.preventDefault()
        toggleTerminal()
        return
      }
      if (matchShortcutEvent(e, shortcuts.toggle_aux_panel)) {
        // The aux panel now hosts the Session Details tab, so it's usable in
        // chat mode too. Cloud sessions expose their outputs in the same panel.
        if (auxPanelToggleDisabled && !isChatMode) return
        e.preventDefault()
        handleToggleAuxPanel()
        return
      }
      if (matchShortcutEvent(e, shortcuts.new_conversation)) {
        if (!showLocalWorkspaceChrome) return
        if (!activeFolder) return
        e.preventDefault()
        // Return to the conversation workspace if a route (e.g. Automations)
        // was covering the content region, else the new tab opens unseen.
        openConversations()
        openNewConversationTab(activeFolder.id, activeFolder.path)
        return
      }
      if (matchShortcutEvent(e, shortcuts.open_folder)) {
        e.preventDefault()
        void handleOpenFolder()
        return
      }
      if (matchShortcutEvent(e, shortcuts.open_settings)) {
        e.preventDefault()
        handleOpenSettings()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [
    activeFolder,
    handleOpenFolder,
    handleOpenSettings,
    openConversations,
    openNewConversationTab,
    setSearchOpen,
    shortcuts,
    toggle,
    handleToggleAuxPanel,
    isCloudRoute,
    toggleTerminal,
    isChatMode,
    auxPanelOpen,
    showLocalWorkspaceChrome,
    auxPanelToggleDisabled,
  ])

  const isMobile = useIsMobile()
  return (
    <>
      <AppTitleBar
        // Desktop grows to h-10 to host the relocated conversation/file tab
        // strips (their native row height); mobile keeps its h-11 default.
        className={isMobile ? undefined : "h-10"}
        left={
          isMobile ? (
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
              <HouflowAccountButton />
              <WorkbenchAccountButton />
            </div>
          ) : (
            // Explicit h-10 (matching the desktop bar): the AppTitleBar row is
            // items-center, so a content-height wrapper won't stretch — the tab
            // host's h-full resolves against this fixed height.
            <div className="flex h-10 flex-1 items-center gap-3 min-w-0">
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 hover:text-foreground/80"
                  onClick={toggle}
                  title={tTitleBar("withShortcut", {
                    label: tTitleBar(isOpen ? "hideSidebar" : "showSidebar"),
                    shortcut: formatShortcutLabel(
                      shortcuts.toggle_sidebar,
                      isMac
                    ),
                  })}
                >
                  <PanelLeft className="h-3.5 w-3.5" />
                </Button>
                <NewFolderDropdown />
                <RemoteWorkspaceDropdown />
                <HouflowAccountButton />
                <WorkbenchAccountButton />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 hover:text-foreground/80"
                  onClick={handleOpenPet}
                  title={tPet("manager.summon")}
                >
                  <PawPrint className="h-3.5 w-3.5" />
                </Button>
              </div>
              {/* Relocated tab strips. Conversation mode: the conversation tabs
                  fill the row. Fusion mode: a resizable split lets the user
                  allocate width between the conversation tabs and the file tabs
                  — the handle IS the divider. Tabs shrink browser-style within
                  each side (no scrollbar). The trailing handle stays draggable
                  so the window can still be moved from the title bar. */}
              <div className="flex h-full min-w-0 flex-1 items-stretch">
                {!showLocalWorkspaceChrome ? (
                  <div data-tauri-drag-region className="h-full min-w-0 flex-1" />
                ) : mode === "fusion" ? (
                  <ResizablePanelGroup
                    direction="horizontal"
                    id="titlebar-tab-group"
                    autoSaveId="titlebar-tab-split"
                    className="min-w-0 flex-1"
                  >
                    <ResizablePanel
                      id="titlebar-conv-tabs"
                      order={1}
                      defaultSize={60}
                      minSize={25}
                    >
                      <TabBar embedded />
                    </ResizablePanel>
                    <ResizableHandle />
                    <ResizablePanel
                      id="titlebar-file-tabs"
                      order={2}
                      defaultSize={40}
                      minSize={20}
                    >
                      <FileWorkspaceTabBar embedded />
                    </ResizablePanel>
                  </ResizablePanelGroup>
                ) : (
                  <div className="flex min-w-0 flex-1">
                    <TabBar embedded />
                  </div>
                )}
                {showLocalWorkspaceChrome ? (
                  <div data-tauri-drag-region className="h-full w-8 shrink-0" />
                ) : null}
              </div>
            </div>
          )
        }
        right={
          isMobile ? (
            <div className="flex items-center gap-1">
              {/* Search lives only in the left sidebar's fixed actions region
                  now (desktop + mobile sheet); no title-bar search entry on any
                  width. The ⌘K shortcut + SearchCommandDialog stay wired here. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <EllipsisVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={handleToggleAuxPanel}
                    disabled={auxPanelToggleDisabled && !isChatMode}
                  >
                    <PanelRight className="h-3.5 w-3.5" />
                    {tTitleBar("toggleAuxPanel")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => toggleTerminal()}
                    disabled={localWorkspaceToolDisabled}
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
          ) : (
            <div className="flex items-center gap-10">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-6 w-6 hover:text-foreground/80 ${terminalOpen ? "bg-accent" : ""}`}
                  onClick={() => toggleTerminal()}
                  disabled={localWorkspaceToolDisabled}
                  title={tTitleBar("withShortcut", {
                    label: tTitleBar("toggleTerminal"),
                    shortcut: formatShortcutLabel(
                      shortcuts.toggle_terminal,
                      isMac
                    ),
                  })}
                >
                  <SquareTerminal className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-6 w-6 hover:text-foreground/80 ${auxPanelOpen ? "bg-accent" : ""}`}
                  onClick={handleToggleAuxPanel}
                  disabled={auxPanelToggleDisabled && !isChatMode}
                  title={tTitleBar("withShortcut", {
                    label: tTitleBar("toggleAuxPanel"),
                    shortcut: formatShortcutLabel(
                      shortcuts.toggle_aux_panel,
                      isMac
                    ),
                  })}
                >
                  <PanelRight className="h-3.5 w-3.5" />
                </Button>
                {/* Desktop search moved into the sidebar's fixed top region;
                    the dialog + ⌘K shortcut still live here. */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 hover:text-foreground/80"
                  onClick={handleOpenSettings}
                  title={tTitleBar("withShortcut", {
                    label: tTitleBar("openSettings"),
                    shortcut: formatShortcutLabel(
                      shortcuts.open_settings,
                      isMac
                    ),
                  })}
                >
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )
        }
      />
      <SearchCommandDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <DirectoryBrowserDialog
        open={browserOpen}
        onOpenChange={setBrowserOpen}
        onSelect={(path) => {
          openFolder(path).catch((err) => {
            console.error("[FolderTitleBar] failed to open folder:", err)
          })
        }}
      />
    </>
  )
}
