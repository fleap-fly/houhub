"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useWorkspaceActions } from "@/contexts/workspace-context"
import { useHouflowDesktop } from "@/houflow"
import {
  isCloudImageOutput,
  isCloudTextOutput,
  mediaTypeForCloudOutputBlob,
  outputMatchesTarget,
} from "@/houflow/cloud-session-output-links"
import { useHouflowCloudWorkspace } from "@/houflow/cloud-workspace-context"
import {
  getHouflowCloudSessionOutputBytes,
  getHouflowCloudSessionOutputText,
  houflowHostedCommandOutputSessionId,
  isHouflowCloudSessionNotFound,
  isCloudSessionActive,
  isHouflowHostedCommandActive,
  listHouflowCloudSessionOutputs,
  type HouflowCloudSessionOutput,
} from "@/houflow/cloud-sessions"
import { toErrorMessage } from "@/lib/app-error"
import { languageFromPath } from "@/lib/language-detect"
import { cn } from "@/lib/utils"

export function CloudSessionOutputsPanel() {
  const t = useTranslations("HouflowCloud")
  const houflow = useHouflowDesktop()
  const cloud = useHouflowCloudWorkspace()
  const { openReadonlyFilePreview } = useWorkspaceActions()
  const [outputs, setOutputs] = useState<HouflowCloudSessionOutput[]>([])
  const [loading, setLoading] = useState(false)
  const [outputsLoaded, setOutputsLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null)
  const [openingOutputId, setOpeningOutputId] = useState<string | null>(null)
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const requestRef = useRef(0)
  const backgroundRefreshInFlightRef = useRef(false)
  const wasActiveRef = useRef(false)
  const openedSelectionNonceRef = useRef<number | null>(null)

  const selectedCloudSessionId = cloud.selectedSession?.id ?? null
  const selectedSessionId =
    selectedCloudSessionId ??
    houflowHostedCommandOutputSessionId(cloud.selectedHostedCommand)
  const selectedOutputRequest = cloud.selectedOutputRequest
  const selectedOutput = useMemo(
    () =>
      selectedOutputId
        ? (outputs.find((output) => output.id === selectedOutputId) ?? null)
        : null,
    [outputs, selectedOutputId]
  )

  const outputsActive =
    isCloudSessionActive(cloud.selectedSession) ||
    isHouflowHostedCommandActive(cloud.selectedHostedCommand)

  const refreshOutputs = useCallback(
    async (background = false) => {
      if (background && backgroundRefreshInFlightRef.current) return
      if (background) backgroundRefreshInFlightRef.current = true
      const requestId = ++requestRef.current
      try {
        if (houflow.session.status !== "signed_in" || !selectedSessionId) {
          setOutputs([])
          setError(null)
          setLoading(false)
          setOutputsLoaded(false)
          setSelectedOutputId(null)
          return
        }
        if (!background) {
          setLoading(true)
          setOutputsLoaded(false)
        }
        setError(null)
        const next = await listHouflowCloudSessionOutputs(
          houflow.session,
          houflow.secret,
          selectedSessionId,
          100
        )
        if (requestRef.current !== requestId) return
        setOutputs(next)
        setSelectedOutputId((current) => {
          if (current && next.some((output) => output.id === current)) {
            return current
          }
          return null
        })
      } catch (err) {
        if (requestRef.current === requestId) {
          // This list endpoint is session-scoped. A typed 404 here means the
          // selected managed session was removed elsewhere, unlike a 404 while
          // fetching one individual output file.
          if (selectedCloudSessionId && isHouflowCloudSessionNotFound(err)) {
            cloud.removeSession(selectedCloudSessionId)
            setOutputs([])
            return
          }
          setError(toErrorMessage(err))
        }
      } finally {
        if (requestRef.current === requestId) {
          if (!background) setLoading(false)
          setOutputsLoaded(true)
        }
        if (background) backgroundRefreshInFlightRef.current = false
      }
    },
    [
      cloud,
      houflow.secret,
      houflow.session,
      selectedCloudSessionId,
      selectedSessionId,
    ]
  )

  const openOutput = useCallback(
    async (output: HouflowCloudSessionOutput) => {
      if (houflow.session.status !== "signed_in" || !selectedSessionId) return
      setSelectedOutputId(output.id)
      setOpeningOutputId(output.id)
      try {
        const displayPath = output.relativePath || output.filename
        const image = isCloudImageOutput(output)
        let content: string
        let language: string

        if (image) {
          if (!canPreviewOutput(output)) {
            throw new Error(t("previewUnavailable"))
          }
          const bytes = await getHouflowCloudSessionOutputBytes(
            houflow.session,
            houflow.secret,
            selectedSessionId,
            output.fileId
          )
          content = await blobToDataUrl(
            new Blob([bytes], { type: mediaTypeForCloudOutputBlob(output) })
          )
          language = "image"
        } else {
          if (!canPreviewOutput(output)) {
            throw new Error(t("previewUnavailable"))
          }
          content = await getHouflowCloudSessionOutputText(
            houflow.session,
            houflow.secret,
            selectedSessionId,
            output.fileId
          )
          language = languageFromPath(displayPath)
        }

        openReadonlyFilePreview({
          id: `houflow:${selectedSessionId}:${output.id}`,
          title: displayPath.split(/[\\/]/).pop() || output.filename,
          description: displayPath,
          path: displayPath,
          language,
          content,
          preview: language === "markdown" || language === "html",
        })
      } catch (err) {
        toast.error(t("previewUnavailable"), {
          description: toErrorMessage(err),
        })
      } finally {
        setOpeningOutputId((current) =>
          current === output.id ? null : current
        )
      }
    },
    [
      houflow.secret,
      houflow.session,
      openReadonlyFilePreview,
      selectedSessionId,
      t,
    ]
  )

  const downloadOutput = useCallback(
    async (output: HouflowCloudSessionOutput) => {
      if (houflow.session.status !== "signed_in" || !selectedSessionId) return
      try {
        const bytes = await getHouflowCloudSessionOutputBytes(
          houflow.session,
          houflow.secret,
          selectedSessionId,
          output.fileId
        )
        downloadBytes(output, bytes)
      } catch (err) {
        toast.error(t("downloadFailed"), { description: toErrorMessage(err) })
      }
    },
    [houflow.secret, houflow.session, selectedSessionId, t]
  )

  useEffect(() => {
    ++requestRef.current
    openedSelectionNonceRef.current = null
    setOutputs([])
    setError(null)
    setLoading(false)
    setOutputsLoaded(false)
    setSelectedOutputId(null)
    setOpeningOutputId(null)
    setSelectionError(null)
  }, [houflow.session.status, houflow.session.workspaceId, selectedSessionId])

  useEffect(() => {
    void refreshOutputs()
  }, [refreshOutputs])

  useEffect(() => {
    const wasActive = wasActiveRef.current
    wasActiveRef.current = outputsActive
    if (wasActive && !outputsActive) {
      void refreshOutputs(true)
    }
    if (!outputsActive) return
    const timer = window.setInterval(() => {
      void refreshOutputs(true)
    }, 2500)
    return () => window.clearInterval(timer)
  }, [outputsActive, refreshOutputs])

  useEffect(() => {
    if (
      !selectedOutputRequest ||
      selectedOutputRequest.sessionId !== selectedSessionId ||
      openedSelectionNonceRef.current === selectedOutputRequest.nonce
    ) {
      return
    }
    const matchingOutput = outputs.find((output) =>
      outputMatchesTarget(output, selectedOutputRequest.target)
    )
    if (matchingOutput) {
      openedSelectionNonceRef.current = selectedOutputRequest.nonce
      setSelectionError(null)
      void openOutput(matchingOutput)
      return
    }
    if (outputsLoaded) {
      openedSelectionNonceRef.current = selectedOutputRequest.nonce
      setSelectedOutputId(null)
      setSelectionError(t("outputNotFound"))
    }
  }, [
    openOutput,
    outputs,
    outputsLoaded,
    selectedOutputRequest,
    selectedSessionId,
    t,
  ])

  if (houflow.session.status !== "signed_in") {
    return <SidebarMessage>{t("signedOut")}</SidebarMessage>
  }

  if (!selectedSessionId) {
    return <SidebarMessage>{t("selectSessionForOutputs")}</SidebarMessage>
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-sidebar">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium">
          {t("outputsTitle")}
        </h3>
        {outputs.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            {t("outputsCount", { count: outputs.length })}
          </span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => void refreshOutputs()}
          disabled={loading}
          title={t("refresh")}
          aria-label={t("refresh")}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
        </Button>
      </header>

      {error ? (
        <div className="m-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      {!error && selectionError ? (
        <div className="m-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          {selectionError}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {outputs.length > 0 ? (
          <div className="space-y-1">
            {outputs.map((output) => (
              <OutputRow
                key={output.id}
                output={output}
                active={output.id === selectedOutput?.id}
                opening={output.id === openingOutputId}
                onOpen={() => void openOutput(output)}
                onDownload={() => void downloadOutput(output)}
                downloadLabel={t("downloadOutput")}
              />
            ))}
          </div>
        ) : loading ? (
          <div className="px-2 py-3 text-xs text-muted-foreground">
            {t("loadingOutputs")}
          </div>
        ) : (
          <div className="px-2 py-3 text-xs text-muted-foreground">
            {t("emptyOutputs")}
          </div>
        )}
      </div>
    </section>
  )
}

function SidebarMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

function OutputRow({
  output,
  active,
  opening,
  onOpen,
  onDownload,
  downloadLabel,
}: {
  output: HouflowCloudSessionOutput
  active: boolean
  opening: boolean
  onOpen: () => void
  onDownload: () => void
  downloadLabel: string
}) {
  return (
    <div
      className={cn(
        "group flex items-center rounded-md transition-colors hover:bg-sidebar-accent",
        active && "bg-sidebar-primary/8"
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onOpen}
      >
        {opening ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : isCloudImageOutput(output) ? (
          <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">
            {displayName(output)}
          </span>
          <span className="block truncate text-[0.6875rem] text-muted-foreground">
            {output.mediaType} · {formatBytes(output.sizeBytes)}
          </span>
        </span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="mr-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        onClick={onDownload}
        title={downloadLabel}
        aria-label={downloadLabel}
      >
        <Download className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

export function canPreviewOutput(output: HouflowCloudSessionOutput): boolean {
  if (isCloudImageOutput(output)) {
    return output.sizeBytes <= 25 * 1024 * 1024
  }
  return output.sizeBytes <= 512 * 1024 && isCloudTextOutput(output)
}

function displayName(output: HouflowCloudSessionOutput): string {
  return output.relativePath || output.filename
}

function downloadOutputName(output: HouflowCloudSessionOutput): string {
  return output.relativePath?.split("/").pop() || output.filename
}

function downloadBytes(output: HouflowCloudSessionOutput, bytes: Uint8Array) {
  const blob = new Blob([bytes], {
    type: mediaTypeForCloudOutputBlob(output),
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = downloadOutputName(output)
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error("read failed"))
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.readAsDataURL(blob)
  })
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B"
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
