; Tauri NSIS installer hooks.
;
; houhub-mcp.exe is the MCP stdio companion spawned by each agent CLI
; (claude / codex / opencode / ...), which is itself a grandchild of
; houhub.exe. Windows does not propagate parent death to descendants the
; way Unix does, so stale houhub-mcp.exe processes from a previous session
; can keep the binary file locked. The installer then fails to overwrite
; it with:
;
;     Error opening file for writing: ...\houhub\houhub-mcp.exe
;
; Stop any running companion processes before the installer writes new
; binaries (or removes the existing ones on uninstall). taskkill returns
; non-zero when no processes match, which is fine — we ignore the result.
;
; Houflow desktop OAuth redirects to hou-agent-hub://oauth after browser
; authorization. Windows does not know that scheme unless the installer writes
; a protocol handler. Register it per-user so the installer does not require
; elevation and so browser callbacks can bring the running app back to front.

!macro REGISTER_HOUHUB_PROTOCOL
  DetailPrint "Registering hou-agent-hub URL protocol..."
  WriteRegStr HKCU "Software\Classes\hou-agent-hub" "" "URL:houhub OAuth"
  WriteRegStr HKCU "Software\Classes\hou-agent-hub" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\hou-agent-hub\DefaultIcon" "" "$INSTDIR\houhub.exe,0"
  WriteRegStr HKCU "Software\Classes\hou-agent-hub\shell\open\command" "" "$\"$INSTDIR\houhub.exe$\" $\"%1$\""
!macroend

!macro UNREGISTER_HOUHUB_PROTOCOL
  DetailPrint "Unregistering hou-agent-hub URL protocol..."
  DeleteRegKey HKCU "Software\Classes\hou-agent-hub"
!macroend

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Stopping any running houhub-mcp processes..."
  nsExec::Exec 'taskkill /F /T /IM houhub-mcp.exe'
  Pop $0
  ; Small grace period so the OS releases file handles before the
  ; installer attempts to overwrite houhub-mcp.exe.
  Sleep 500
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro REGISTER_HOUHUB_PROTOCOL
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Stopping any running houhub-mcp processes..."
  nsExec::Exec 'taskkill /F /T /IM houhub-mcp.exe'
  Pop $0
  Sleep 500
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro UNREGISTER_HOUHUB_PROTOCOL
!macroend
