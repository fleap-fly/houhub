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
; houhub-computer-helper.exe, the computer-use helper, is houhub's own child
; and exits when houhub does — but not necessarily before the updater starts
; writing, and a running one holds its file just the same. `/T` takes the
; cua-driver it runs with it (the driver lives in the user's cache, not here,
; but is the helper's child and has no business outliving it).
;
; Stop the companion and helper processes running from $INSTDIR before the
; installer writes new binaries (or removes the existing ones on uninstall)
; — only those: a houhub-server installed in a folder of its own runs copies
; under the same names, and they are not this installer's to stop.
; PowerShell finds them by path (CIM reports a process's path whatever this
; installer's bitness), and the folder reaches it in an environment
; variable, never inside the command, so no character in it can change what
; runs. If PowerShell cannot do that, every process of those names is
; stopped, as before: one left running keeps its file locked. taskkill
; returns non-zero when no processes match, which is fine — we ignore the
; result.

!macro HOUHUB_STOP_SIDECARS
  DetailPrint "Stopping houhub-mcp and houhub-computer-helper processes running from $INSTDIR..."
  System::Call 'kernel32::SetEnvironmentVariable(t "HOUHUB_INSTDIR", t "$INSTDIR")'
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$$ErrorActionPreference = 'Stop'; $$dir = $$env:HOUHUB_INSTDIR.TrimEnd('\') + '\'; Get-CimInstance Win32_Process | Where-Object { ($$_.Name -eq 'houhub-mcp.exe' -or $$_.Name -eq 'houhub-computer-helper.exe') -and $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith($$dir, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { & taskkill.exe /F /T /PID $$_.ProcessId | Out-Null }; exit 0"`
  Pop $0
  ${If} $0 != "0"
    nsExec::Exec 'taskkill /F /T /IM houhub-mcp.exe'
    Pop $0
    nsExec::Exec 'taskkill /F /T /IM houhub-computer-helper.exe'
    Pop $0
  ${EndIf}
  ; Small grace period so the OS releases file handles before the
  ; installer attempts to overwrite the binaries.
  Sleep 500
!macroend

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
  !insertmacro HOUHUB_STOP_SIDECARS
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro REGISTER_HOUHUB_PROTOCOL
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro HOUHUB_STOP_SIDECARS
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro UNREGISTER_HOUHUB_PROTOCOL
!macroend

; Deliberately NOT cleaning up the "launch at login" HKCU Run values here.
; Tauri's installer template inserts NSIS_HOOK_PREUNINSTALL unconditionally at
; the top of `Section Uninstall`, and an upgrading install runs the *previous*
; version's uninstaller (`ExecWait` in the `reinst_uninstall` branch) — so a
; DeleteRegValue in this hook would silently turn launch-at-login off on every
; update, not just on a real uninstall. `$UpdateMode` only distinguishes the two
; when the in-app updater drove it; a manually re-run installer looks like a
; plain uninstall. Leaving a stale Run value behind after an uninstall is
; cosmetic (Windows ignores an entry whose target is gone), so it wins over
; losing the user's setting on upgrade.
