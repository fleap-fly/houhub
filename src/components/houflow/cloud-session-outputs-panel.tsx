"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { MessageResponse } from "@/components/ai-elements/message"
import { Button } from "@/components/ui/button"
import { ImagePreviewDialog } from "@/components/ui/image-preview-dialog"
import { useHouflowDesktop } from "@/houflow"
import { useHouflowCloudWorkspace } from "@/houflow/cloud-workspace-context"
import {
  getHouflowCloudSessionOutputBytes,
  getHouflowCloudSessionOutputText,
  listHouflowCloudSessionOutputs,
  type HouflowCloudSessionOutput,
} from "@/houflow/cloud-sessions"
import { toErrorMessage } from "@/lib/app-error"
import { cn } from "@/lib/utils"

export function CloudSessionOutputsPanel() {
  const t = useTranslations("HouflowCloud")
  const houflow = useHouflowDesktop()
  const cloud = useHouflowCloudWorkspace()
  const [outputs, setOutputs] = useState<HouflowCloudSessionOutput[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null)
  const [previewText, setPreviewText] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [imageDialogOpen, setImageDialogOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const requestRef = useRef(0)

  const selectedSessionId = cloud.selectedSession?.id ?? null
  const selectedOutput = useMemo(
    () =>
      selectedOutputId
        ? (outputs.find((output) => output.id === selectedOutputId) ?? null)
        : null,
    [outputs, selectedOutputId]
  )

  const refreshOutputs = useCallback(async () => {
    const requestId = ++requestRef.current
    if (houflow.session.status !== "signed_in" || !selectedSessionId) {
      setOutputs([])
      setError(null)
      setLoading(false)
      setSelectedOutputId(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const next = await listHouflowCloudSessionOutputs(
        houflow.session,
        houflow.secret,
        selectedSessionId
      )
      if (requestRef.current !== requestId) return
      setOutputs(next)
      setSelectedOutputId((current) => {
        if (current && next.some((output) => output.id === current)) {
          return current
        }
        return next[0]?.id ?? null
      })
    } catch (err) {
      if (requestRef.current === requestId) setError(toErrorMessage(err))
    } finally {
      if (requestRef.current === requestId) setLoading(false)
    }
  }, [houflow.secret, houflow.session, selectedSessionId])

  useEffect(() => {
    ++requestRef.current
    setOutputs([])
    setError(null)
    setLoading(false)
    setSelectedOutputId(null)
    setPreviewText(null)
    setPreviewError(null)
    setPreviewLoading(false)
    setImageDialogOpen(false)
  }, [houflow.session.status, houflow.session.workspaceId, selectedSessionId])

  useEffect(() => {
    void refreshOutputs()
  }, [refreshOutputs])

  useEffect(() => {
    if (!previewUrl) return
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  useEffect(() => {
    let cancelled = false
    async function loadPreview() {
      setPreviewText(null)
      setPreviewError(null)
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
      setImageDialogOpen(false)
      if (
        houflow.session.status !== "signed_in" ||
        !selectedSessionId ||
        !selectedOutput ||
        !canPreviewOutput(selectedOutput)
      ) {
        setPreviewLoading(false)
        return
      }
      setPreviewLoading(true)
      try {
        if (isImageOutput(selectedOutput)) {
          const bytes = await getHouflowCloudSessionOutputBytes(
            houflow.session,
            houflow.secret,
            selectedSessionId,
            selectedOutput.filename
          )
          if (cancelled) return
          const blob = new Blob([bytes], {
            type: selectedOutput.mediaType || "application/octet-stream",
          })
          setPreviewUrl(URL.createObjectURL(blob))
          return
        }

        const text = await getHouflowCloudSessionOutputText(
          houflow.session,
          houflow.secret,
          selectedSessionId,
          selectedOutput.filename
        )
        if (!cancelled) setPreviewText(text)
      } catch (err) {
        if (!cancelled) setPreviewError(toErrorMessage(err))
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    }
    void loadPreview()
    return () => {
      cancelled = true
    }
  }, [houflow.secret, houflow.session, selectedOutput, selectedSessionId])

  const downloadOutput = useCallback(
    async (output: HouflowCloudSessionOutput) => {
      if (houflow.session.status !== "signed_in" || !selectedSessionId) return
      try {
        const bytes = await getHouflowCloudSessionOutputBytes(
          houflow.session,
          houflow.secret,
          selectedSessionId,
          output.filename
        )
        downloadBytes(output, bytes)
      } catch (err) {
        toast.error(t("downloadFailed"), { description: toErrorMessage(err) })
      }
    },
    [houflow.secret, houflow.session, selectedSessionId, t]
  )

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

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="max-h-56 shrink-0 overflow-y-auto border-b border-border p-2">
          {outputs.length > 0 ? (
            <div className="space-y-1">
              {outputs.map((output) => (
                <OutputRow
                  key={output.id}
                  output={output}
                  active={output.id === selectedOutputId}
                  onSelect={() => setSelectedOutputId(output.id)}
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

        <div className="min-h-0 flex-1 overflow-auto">
          {selectedOutput ? (
            <div className="flex min-h-full flex-col">
              <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                  {displayName(selectedOutput)}
                </span>
                {isHtmlOutput(selectedOutput) && previewText ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    title={t("openPreview")}
                    aria-label={t("openPreview")}
                    onClick={() => openHtmlPreview(selectedOutput, previewText)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title={t("downloadOutput")}
                  aria-label={t("downloadOutput")}
                  onClick={() => void downloadOutput(selectedOutput)}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </div>
              {previewLoading ? (
                <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t("loadingPreview")}
                </div>
              ) : previewError ? (
                <div className="px-3 py-3 text-xs text-destructive">
                  {previewError}
                </div>
              ) : previewUrl && isImageOutput(selectedOutput) ? (
                <button
                  type="button"
                  className="flex min-h-48 flex-1 items-center justify-center bg-muted/30 p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setImageDialogOpen(true)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt={selectedOutput.filename}
                    className="max-h-full max-w-full rounded-md object-contain"
                  />
                </button>
              ) : canTextPreviewOutput(selectedOutput) && previewText ? (
                <OutputPreview output={selectedOutput} text={previewText} />
              ) : (
                <div className="px-3 py-3 text-xs text-muted-foreground">
                  {t("previewUnavailable")}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {previewUrl && selectedOutput ? (
        <ImagePreviewDialog
          src={previewUrl}
          alt={selectedOutput.filename}
          open={imageDialogOpen}
          onOpenChange={setImageDialogOpen}
          onDownload={() => void downloadOutput(selectedOutput)}
          downloadLabel={t("downloadOutput")}
        />
      ) : null}
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
  onSelect,
}: {
  output: HouflowCloudSessionOutput
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left outline-none",
        "transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-sidebar-primary/8"
      )}
      onClick={onSelect}
    >
      {isImageOutput(output) ? (
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
  )
}

function OutputPreview({
  output,
  text,
}: {
  output: HouflowCloudSessionOutput
  text: string
}) {
  if (isHtmlOutput(output)) {
    return (
      <iframe
        title={output.filename}
        srcDoc={text}
        sandbox=""
        className="h-full min-h-80 w-full flex-1 bg-white"
      />
    )
  }

  if (isMarkdownOutput(output)) {
    return (
      <div className="overflow-auto px-3 py-3 text-sm">
        <MessageResponse>{text}</MessageResponse>
      </div>
    )
  }

  return (
    <pre className="overflow-auto whitespace-pre-wrap px-3 py-3 font-mono text-xs leading-5">
      {text}
    </pre>
  )
}

export function canPreviewOutput(output: HouflowCloudSessionOutput): boolean {
  if (output.sizeBytes > 2 * 1024 * 1024) return false
  return isImageOutput(output) || canTextPreviewOutput(output)
}

function canTextPreviewOutput(output: HouflowCloudSessionOutput): boolean {
  if (output.sizeBytes > 512 * 1024) return false
  return (
    output.mediaType.startsWith("text/") ||
    isMarkdownOutput(output) ||
    isHtmlOutput(output) ||
    output.mediaType === "application/json"
  )
}

function isImageOutput(output: HouflowCloudSessionOutput): boolean {
  return output.mediaType.startsWith("image/")
}

function isMarkdownOutput(output: HouflowCloudSessionOutput): boolean {
  const name = output.filename.toLowerCase()
  return (
    output.mediaType === "text/markdown" ||
    name.endsWith(".md") ||
    name.endsWith(".markdown")
  )
}

function isHtmlOutput(output: HouflowCloudSessionOutput): boolean {
  const name = output.filename.toLowerCase()
  return output.mediaType === "text/html" || name.endsWith(".html")
}

function displayName(output: HouflowCloudSessionOutput): string {
  return output.relativePath || output.filename
}

function downloadOutputName(output: HouflowCloudSessionOutput): string {
  return output.relativePath?.split("/").pop() || output.filename
}

function downloadBytes(output: HouflowCloudSessionOutput, bytes: Uint8Array) {
  const blob = new Blob([bytes], {
    type: output.mediaType || "application/octet-stream",
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

function openHtmlPreview(output: HouflowCloudSessionOutput, text: string) {
  const blob = new Blob([text], { type: output.mediaType || "text/html" })
  const url = URL.createObjectURL(blob)
  const opened = window.open(url, "_blank", "noreferrer")
  if (!opened) {
    URL.revokeObjectURL(url)
    return
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B"
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
