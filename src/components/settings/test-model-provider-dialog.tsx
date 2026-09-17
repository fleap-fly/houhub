"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { parseClaudeProviderModel, type ModelProviderInfo } from "@/lib/types"
import { testModelProvider } from "@/lib/api"

interface TestResult {
  success: boolean
  latencyMs: number
  message: string
  preview?: string
}

interface TestModelProviderDialogProps {
  provider: ModelProviderInfo | null
  onOpenChange: (open: boolean) => void
}

export function TestModelProviderDialog({
  provider,
  onOpenChange,
}: TestModelProviderDialogProps) {
  const t = useTranslations("ModelProviderSettings")
  const [selectedModel, setSelectedModel] = useState("")
  const [customModel, setCustomModel] = useState("")
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)

  const modelList = useMemo(() => {
    if (!provider) return []
    return provider.models.length > 0
      ? provider.models
      : [parseClaudeProviderModel(provider.model).main ?? provider.model ?? ""]
          .map((model) => model.trim())
          .filter(Boolean)
  }, [provider])

  useEffect(() => {
    if (!provider) return
    setSelectedModel(modelList[0] ?? "")
    setCustomModel("")
    setResult(null)
  }, [provider, modelList])

  const effectiveModel = customModel.trim() || selectedModel

  const handleTest = useCallback(async () => {
    if (!provider || !effectiveModel) return
    setTesting(true)
    setResult(null)

    try {
      // The backend owns the request: the desktop webview cannot POST to a
      // third-party endpoint cross-origin, and in server mode the key must not
      // be sent from the page. Same route the "fetch models" button uses.
      const outcome = await testModelProvider({
        baseUrl: provider.api_url,
        apiKey: provider.api_key,
        model: effectiveModel,
      })
      setResult(
        outcome.success
          ? {
              success: true,
              latencyMs: outcome.latencyMs,
              message: t("testSuccess"),
              preview: outcome.preview ?? "",
            }
          : {
              success: false,
              latencyMs: outcome.latencyMs,
              message: outcome.error ?? t("testFailed"),
            }
      )
    } catch (err) {
      setResult({
        success: false,
        latencyMs: 0,
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setTesting(false)
    }
  }, [provider, effectiveModel, t])

  return (
    <Dialog open={!!provider} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("testProvider")} — {provider?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">{t("testModel")}</label>
            {modelList.length > 0 ? (
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={modelList[0]} />
                </SelectTrigger>
                <SelectContent>
                  {modelList.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Input
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              placeholder={t("testModelCustomPlaceholder")}
              className="text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              {t("testModelHint")}
            </p>
          </div>

          {result && (
            <div
              className={`rounded-md border px-3 py-2.5 text-xs space-y-1 ${
                result.success
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-red-500/30 bg-red-500/5"
              }`}
            >
              <div className="flex items-center gap-1.5 font-medium">
                {result.success ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-red-500" />
                )}
                <span>{result.message}</span>
                <span className="ml-auto text-muted-foreground">
                  {result.latencyMs}ms
                </span>
              </div>
              {result.preview && (
                <p className="text-muted-foreground whitespace-pre-wrap break-all pt-1 border-t border-border/50">
                  {result.preview}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
          <Button onClick={handleTest} disabled={testing || !effectiveModel}>
            {testing && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            {t("runTest")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
