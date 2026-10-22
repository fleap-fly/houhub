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
; writing, and a running one holds its file just the same. The cua-driver it
; runs goes with it (the driver lives in the user's cache, not here, but is
; the helper's child and has no business outliving it).
;
; Stop the companion and helper processes running from $INSTDIR before the
; installer writes new binaries (or removes the existing ones on uninstall)
; — only those: a houhub-server installed in a folder of its own runs copies
; under the same names, and they are not this installer's to stop.
; The installer finds them itself, through the Windows API: it lists the
; processes, asks each one of those names which file it runs (the answer
; does not depend on this installer's bitness), and ends those running from
; $INSTDIR, then the processes each of them started. Nothing in it waits
; without a limit: at most five seconds for each process it ends. This used
; to be PowerShell's job, through WMI, and the installer waited for
; PowerShell without a time limit: on some machines the WMI query never
; returned, and the install stood still at this step for good.
;
; In an update, the houhub that started this installer is still on its way
; out: Tauri's updater starts the installer first and exits after. Right
; after this hook, Tauri's own check asks Restart Manager, once, which
; processes use houhub.exe, has it close all of them, and stops the update
; with "Failed to kill houhub" if any cannot be closed (tauri-apps/tauri#16277).
; A houhub in the middle of exiting can be one. So can a process that only has
; the file open at that moment, which Restart Manager counts as using it just
; the same: Windows verifying the file's signature, or an antivirus scanning
; it, runs in another session with rights this installer does not have.
; So an update deals with houhub.exe first. It waits for each houhub running
; from $INSTDIR in this session to end, 15 seconds at most in all, and ends
; the ones still running then. A houhub in another user's session is not this
; installer's to end. Then it waits, 10 seconds at most, until Restart
; Manager finds nothing using houhub.exe, and moves houhub.exe aside like a
; sidecar below, whether something still uses it or not: a process can open
; the file again between the last look and the check, and a check that finds
; no houhub.exe finds nothing to close. Whatever holds the old file keeps it,
; and the install writes houhub.exe anew. If it does not — the write fails and
; is skipped, or the install stops first — the old one is put back: when the
; install carries on to its end, or when a stopped one is closed.
;
; Stopping them is not always enough: whatever starts a companion — an agent,
; or a houhub still running — can start one again before the installer
; reaches the file, and a process this installer is not allowed to stop holds
; the file all the same. But Windows lets the file of a running executable be
; renamed.
; So a sidecar whose file is still in use once the processes were stopped is
; moved aside, to its own name plus `.<n>.old` in the same folder: whatever
; runs it carries on, and the installer writes the new binary under the old
; name. The aside files are deleted after the install, or by the next install
; or uninstall, once nothing runs them any more.
;
; Not, though, when an interactive install is about to ask whether to close a
; running houhub: on a no it stops there, and that houhub would be left without
; its companion. Silent and passive installs, the updater's included, close it
; without asking. An install stopped later on, at some other file, leaves a
; moved file where it is; the next install deletes it and writes the new one.
;
; houhub-cli.exe, the command-line client, is never stopped: a houhub-cli that
; runs is the user's own command, a review a CI job is waiting for, say. One
; in use is moved aside the same way. Its copy in bin\ is the one that goes on
; PATH (docs/cli.md): $INSTDIR itself would put houhub-mcp.exe and the rest
; there too. The copy is made after the install, from the houhub-cli.exe just
; written, and moved aside first if it is running — the copy a terminal runs.
; A copy that fails puts the moved one back: an older houhub-cli beats none.
; The uninstaller removes it after Tauri's own files, and then $INSTDIR, which
; Tauri's uninstaller could not remove with bin\ still in it. Not before
; them: the uninstaller stops when the user will not close a running houhub,
; and that houhub would be left without its command. One still running is
; renamed out of the way instead, so PATH stops finding a houhub-cli of an app
; that is gone; the next install, or the user once it ends, deletes it.

!define HOUHUB_TH32CS_SNAPPROCESS 0x2
; PROCESS_TERMINATE | PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE
!define HOUHUB_PROCESS_STOP_ACCESS 0x101001
; PROCESSENTRY32W as this 32-bit installer lays it out: dwSize, cntUsage,
; th32ProcessID, th32DefaultHeapID, th32ModuleID, cntThreads,
; th32ParentProcessID, pcPriClassBase, dwFlags, szExeFile.
!define HOUHUB_PROCESSENTRY32W "&l4, i, i, p, i, i, i, i, i, &w260"
; PROCESS_BASIC_INFORMATION, likewise: ExitStatus, PebBaseAddress,
; AffinityMask, BasePriority, UniqueProcessId, InheritedFromUniqueProcessId.
!define HOUHUB_PROCESS_BASIC_INFORMATION "i, p, p, i, p, p"
!define HOUHUB_PROCESS_BASIC_INFORMATION_SIZE 24

; Ends the processes that process $3 started, $4 (this installer) aside.
; The snapshot is a moment old, and the id it gives may belong to another
; process by the time it is opened, so the process opened is asked who
; started it. $3 is still held open, so no other process can have its id
; yet; but one older than $8, when $3 started, was started by an earlier
; process under the same id, and is left alone.
!macro HOUHUB_STOP_CHILDREN
  System::Call 'kernel32::CreateToolhelp32Snapshot(i ${HOUHUB_TH32CS_SNAPPROCESS}, i 0) p .R0'
  ${If} $R0 P<> -1
    System::Call '*(${HOUHUB_PROCESSENTRY32W}) p .R1'
    System::Call '*(${HOUHUB_PROCESS_BASIC_INFORMATION}) p .R8'
    ${If} $R1 P<> 0
    ${AndIf} $R8 P<> 0
      System::Call 'kernel32::Process32FirstW(p R0, p R1) i .R2'
      ${DoWhile} $R2 <> 0
        System::Call '*$R1(i, i, i .R3, p, i, i, i .R4)'
        ${If} $R4 = $3
        ${AndIf} $R3 <> $4
          System::Call 'kernel32::OpenProcess(i ${HOUHUB_PROCESS_STOP_ACCESS}, i 0, i R3) p .R5'
          ${If} $R5 P<> 0
            System::Call 'ntdll::NtQueryInformationProcess(p R5, i 0, p R8, i ${HOUHUB_PROCESS_BASIC_INFORMATION_SIZE}, p 0) i .R7'
            ${If} $R7 = 0
              System::Call '*$R8(i, p, p, i, p, p .R4)'
              System::Call 'kernel32::GetProcessTimes(p R5, *l .R6, *l, *l, *l) i .R7'
              ${If} $R4 = $3
              ${AndIf} $R7 <> 0
              ${AndIf} $R6 L>= $8
                System::Call 'kernel32::TerminateProcess(p R5, i 1)'
                System::Call 'kernel32::WaitForSingleObject(p R5, i 5000)'
              ${EndIf}
            ${EndIf}
            System::Call 'kernel32::CloseHandle(p R5)'
          ${EndIf}
        ${EndIf}
        System::Call 'kernel32::Process32NextW(p R0, p R1) i .R2'
      ${Loop}
    ${EndIf}
    ${IfThen} $R1 P<> 0 ${|} System::Free $R1 ${|}
    ${IfThen} $R8 P<> 0 ${|} System::Free $R8 ${|}
    System::Call 'kernel32::CloseHandle(p R0)'
  ${EndIf}
!macroend

; Ends the houhub-mcp and houhub-computer-helper processes running from
; $INSTDIR, and the processes they started.
!macro HOUHUB_STOP_SIDECARS
  DetailPrint "Stopping houhub-mcp and houhub-computer-helper processes running from $INSTDIR..."
  System::Call 'kernel32::GetCurrentProcessId() i .r4'
  System::Call 'kernel32::CreateToolhelp32Snapshot(i ${HOUHUB_TH32CS_SNAPPROCESS}, i 0) p .r0'
  ${If} $0 P<> -1
    System::Call '*(${HOUHUB_PROCESSENTRY32W}) p .r1'
    ${If} $1 P<> 0
      System::Call 'kernel32::Process32FirstW(p r0, p r1) i .r2'
      ${DoWhile} $2 <> 0
        System::Call '*$1(i, i, i .r3, p, i, i, i, i, i, &w260 .r5)'
        ${If} $5 == "houhub-mcp.exe"
        ${OrIf} $5 == "houhub-computer-helper.exe"
          System::Call 'kernel32::OpenProcess(i ${HOUHUB_PROCESS_STOP_ACCESS}, i 0, i r3) p .r6'
          ${If} $6 P<> 0
            System::Call 'kernel32::QueryFullProcessImageNameW(p r6, i 0, w .r7, *i ${NSIS_MAX_STRLEN}) i .r9'
            ${If} $9 <> 0
            ${AndIf} $7 == "$INSTDIR\$5"
              DetailPrint "Stopping $7 (process $3)"
              System::Call 'kernel32::GetProcessTimes(p r6, *l .r8, *l, *l, *l) i .r9'
              System::Call 'kernel32::TerminateProcess(p r6, i 1)'
              System::Call 'kernel32::WaitForSingleObject(p r6, i 5000)'
              ${If} $9 <> 0
                !insertmacro HOUHUB_STOP_CHILDREN
              ${EndIf}
            ${EndIf}
            System::Call 'kernel32::CloseHandle(p r6)'
          ${EndIf}
        ${EndIf}
        System::Call 'kernel32::Process32NextW(p r0, p r1) i .r2'
      ${Loop}
      System::Free $1
    ${EndIf}
    System::Call 'kernel32::CloseHandle(p r0)'
  ${EndIf}
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

; $R9 = 1 when `path` can be opened for writing, as `File` will have to open
; it, else 0. A running executable's file cannot be; a missing one counts as
; writable.
!macro HOUHUB_CAN_WRITE path
  StrCpy $R9 1
  ${If} ${FileExists} "${path}"
    ClearErrors
    FileOpen $R8 "${path}" a
    ${If} ${Errors}
      StrCpy $R9 0
    ${Else}
      FileClose $R8
    ${EndIf}
  ${EndIf}
!macroend

!macro HOUHUB_MOVE_ASIDE_IF_IN_USE name
  !insertmacro HOUHUB_CAN_WRITE "$INSTDIR\${name}"
  ${If} $R9 = 0
    System::Call 'kernel32::GetTickCount() i .R8'
    DetailPrint "$INSTDIR\${name} is still in use, moving it aside..."
    Rename "$INSTDIR\${name}" "$INSTDIR\${name}.$R8.old"
  ${EndIf}
!macroend

!macro HOUHUB_DELETE_ASIDE
  ; Not while houhub.exe is missing: then the one moved aside can be the only
  ; copy left (see HOUHUB_RESTORE_APP).
  ${If} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
    Delete "$INSTDIR\${MAINBINARYNAME}.exe.*.old"
  ${EndIf}
  Delete "$INSTDIR\houhub-mcp.exe.*.old"
  Delete "$INSTDIR\houhub-computer-helper.exe.*.old"
  Delete "$INSTDIR\houhub-cli.exe.*.old"
  Delete "$INSTDIR\bin\houhub-cli.exe.*.old"
!macroend

; In an update: waits for each process running $INSTDIR\houhub.exe in this
; installer's session to end, 15 seconds at most in all, and ends the ones
; still running then. The houhub that started this installer is usually gone
; within a second.
!macro HOUHUB_STOP_UPDATED_APP
  System::Call 'kernel32::GetCurrentProcessId() i .r4'
  System::Call 'kernel32::ProcessIdToSessionId(i r4, *i .r5)'
  System::Call 'kernel32::GetTickCount() i .r9'
  System::Call 'kernel32::CreateToolhelp32Snapshot(i ${HOUHUB_TH32CS_SNAPPROCESS}, i 0) p .r0'
  ${If} $0 P<> -1
    System::Call '*(${HOUHUB_PROCESSENTRY32W}) p .r1'
    ${If} $1 P<> 0
      System::Call 'kernel32::Process32FirstW(p r0, p r1) i .r2'
      ${DoWhile} $2 <> 0
        System::Call '*$1(i, i, i .r3, p, i, i, i, i, i, &w260 .r6)'
        ${If} $6 == "${MAINBINARYNAME}.exe"
          System::Call 'kernel32::ProcessIdToSessionId(i r3, *i .r7) i .r8'
          ${If} $8 <> 0
          ${AndIf} $7 = $5
            System::Call 'kernel32::OpenProcess(i ${HOUHUB_PROCESS_STOP_ACCESS}, i 0, i r3) p .r6'
            ${If} $6 P<> 0
              System::Call 'kernel32::QueryFullProcessImageNameW(p r6, i 0, w .r7, *i ${NSIS_MAX_STRLEN}) i .r8'
              ${If} $8 <> 0
              ${AndIf} $7 == "$INSTDIR\${MAINBINARYNAME}.exe"
                ; What is left of the 15 seconds.
                System::Call 'kernel32::GetTickCount() i .r8'
                IntOp $8 $8 - $9
                IntOp $8 15000 - $8
                ${IfThen} $8 < 0 ${|} StrCpy $8 0 ${|}
                DetailPrint "Waiting for $7 (process $3) to exit..."
                System::Call 'kernel32::WaitForSingleObject(p r6, i r8) i .r8'
                ${If} $8 <> 0
                  DetailPrint "Stopping $7 (process $3)"
                  System::Call 'kernel32::TerminateProcess(p r6, i 1)'
                  System::Call 'kernel32::WaitForSingleObject(p r6, i 5000)'
                ${EndIf}
              ${EndIf}
              System::Call 'kernel32::CloseHandle(p r6)'
            ${EndIf}
          ${EndIf}
        ${EndIf}
        System::Call 'kernel32::Process32NextW(p r0, p r1) i .r2'
      ${Loop}
      System::Free $1
    ${EndIf}
    System::Call 'kernel32::CloseHandle(p r0)'
  ${EndIf}
!macroend

; $R9 = 1 when Restart Manager finds a process using `path`, as Tauri's check
; will ask it, else 0 — also when it cannot tell, which that check passes too.
!macro HOUHUB_RM_FINDS_USE path
  StrCpy $R9 0
  System::Call 'rstrtmgr::RmStartSession(*i .R0, i 0, w) i .R2'
  ${If} $R2 = 0
    System::Call 'rstrtmgr::RmRegisterResources(i R0, i 1, *ws, i 0, p 0, i 0, p 0) i .R2' "${path}"
    ${If} $R2 = 0
      System::Call 'rstrtmgr::RmGetList(i R0, *i .R3, *i .R4, p 0, *i .R5) i .R2'
      ; ERROR_MORE_DATA: there are processes to list.
      ${IfThen} $R2 = 234 ${|} StrCpy $R9 1 ${|}
    ${EndIf}
    System::Call 'rstrtmgr::RmEndSession(i R0)'
  ${EndIf}
!macroend

; houhub.exe, and where HOUHUB_CLEAR_APP_FOR_CHECK moved it, if it did.
Var HouHubApp
Var HouHubAppAside

; In an update, right before Tauri's check: until Restart Manager finds
; nothing using houhub.exe, 100 retries, 100 ms apart. Then houhub.exe is
; moved aside, retried the same way while that fails: a process can hold the
; file without letting it be renamed, for a while.
!macro HOUHUB_CLEAR_APP_FOR_CHECK
  !insertmacro HOUHUB_RM_FINDS_USE "$INSTDIR\${MAINBINARYNAME}.exe"
  ${If} $R9 = 1
    DetailPrint "Waiting for $INSTDIR\${MAINBINARYNAME}.exe to be released..."
    ${For} $R7 1 100
      Sleep 100
      !insertmacro HOUHUB_RM_FINDS_USE "$INSTDIR\${MAINBINARYNAME}.exe"
      ${IfThen} $R9 = 0 ${|} ${ExitFor} ${|}
    ${Next}
  ${EndIf}
  StrCpy $HouHubApp "$INSTDIR\${MAINBINARYNAME}.exe"
  ${If} ${FileExists} "$HouHubApp"
    System::Call 'kernel32::GetTickCount() i .R8'
    DetailPrint "Moving $HouHubApp aside..."
    ${For} $R7 1 100
      ClearErrors
      Rename "$HouHubApp" "$HouHubApp.$R8.old"
      ${IfNot} ${Errors}
        StrCpy $HouHubAppAside "$HouHubApp.$R8.old"
        ${ExitFor}
      ${EndIf}
      Sleep 100
    ${Next}
    ${IfThen} $HouHubAppAside == "" ${|} DetailPrint "Could not move $HouHubApp aside" ${|}
  ${EndIf}
!macroend

; Puts houhub.exe back if HOUHUB_CLEAR_APP_FOR_CHECK moved it and the install
; wrote no new one: an older houhub beats none. Retried like the move, for the
; same reason; one that still fails leaves the moved file to the user, which
; HOUHUB_DELETE_ASIDE keeps while houhub.exe is missing.
!macro HOUHUB_RESTORE_APP
  ${If} $HouHubAppAside != ""
  ${AndIfNot} ${FileExists} "$HouHubApp"
  ${AndIf} ${FileExists} "$HouHubAppAside"
    ${For} $R7 1 100
      ClearErrors
      Rename "$HouHubAppAside" "$HouHubApp"
      ${IfNot} ${Errors}
        ${ExitFor}
      ${EndIf}
      Sleep 100
    ${Next}
  ${EndIf}
!macroend

; An install stopped after houhub.exe was moved aside, before it was written
; anew. NSIS calls this as the stopped install is closed (a silent one, at
; once). Tauri's template has none of its own, and includes this file before
; it defines MAINBINARYNAME or $UpdateMode: a function here, unlike the macros,
; can use neither, hence $HouHubApp.
Function .onInstFailed
  !insertmacro HOUHUB_RESTORE_APP
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  ${If} $UpdateMode = 1
    !insertmacro HOUHUB_STOP_UPDATED_APP
  ${EndIf}
  !insertmacro HOUHUB_STOP_SIDECARS
  !insertmacro HOUHUB_DELETE_ASIDE
  ; Silent and passive installs close a running houhub without asking. An
  ; interactive one asks only if houhub runs, and houhub.exe's file is in use
  ; while it does.
  ${If} ${Silent}
  ${OrIf} $PassiveMode = 1
    StrCpy $R9 1
  ${Else}
    !insertmacro HOUHUB_CAN_WRITE "$INSTDIR\${MAINBINARYNAME}.exe"
  ${EndIf}
  ${If} $R9 = 1
    !insertmacro HOUHUB_MOVE_ASIDE_IF_IN_USE "houhub-mcp.exe"
    !insertmacro HOUHUB_MOVE_ASIDE_IF_IN_USE "houhub-computer-helper.exe"
    !insertmacro HOUHUB_MOVE_ASIDE_IF_IN_USE "houhub-cli.exe"
  ${EndIf}
  ${If} $UpdateMode = 1
    !insertmacro HOUHUB_CLEAR_APP_FOR_CHECK
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; houhub.exe's own write can fail and be skipped.
  !insertmacro HOUHUB_RESTORE_APP
  CreateDirectory "$INSTDIR\bin"
  !insertmacro HOUHUB_MOVE_ASIDE_IF_IN_USE "bin\houhub-cli.exe"
  ClearErrors
  CopyFiles /SILENT "$INSTDIR\houhub-cli.exe" "$INSTDIR\bin\houhub-cli.exe"
  ${If} ${Errors}
    DetailPrint "Could not copy houhub-cli.exe into $INSTDIR\bin"
    ; $R9 = 0 and $R8: HOUHUB_MOVE_ASIDE_IF_IN_USE moved it to .$R8.old.
    ${If} $R9 = 0
    ${AndIfNot} ${FileExists} "$INSTDIR\bin\houhub-cli.exe"
      Rename "$INSTDIR\bin\houhub-cli.exe.$R8.old" "$INSTDIR\bin\houhub-cli.exe"
    ${EndIf}
  ${EndIf}
  !insertmacro HOUHUB_DELETE_ASIDE
  !insertmacro REGISTER_HOUHUB_PROTOCOL
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro HOUHUB_STOP_SIDECARS
  !insertmacro HOUHUB_DELETE_ASIDE
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro UNREGISTER_HOUHUB_PROTOCOL
  ${If} ${FileExists} "$INSTDIR\bin\houhub-cli.exe"
    ClearErrors
    Delete "$INSTDIR\bin\houhub-cli.exe"
    ${If} ${Errors}
      System::Call 'kernel32::GetTickCount() i .R8'
      Rename "$INSTDIR\bin\houhub-cli.exe" "$INSTDIR\bin\houhub-cli.exe.$R8.old"
    ${EndIf}
  ${EndIf}
  Delete "$INSTDIR\bin\houhub-cli.exe.*.old"
  RMDir "$INSTDIR\bin"
  RMDir "$INSTDIR"
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
