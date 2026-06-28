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
import type { ModelProviderInfo } from "@/lib/types"

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
      : provider.model
        ? [provider.model]
        : []
  }, [provider])

  useEffect(() => {
    if (!provider) return
    setSelectedModel(provider.model ?? provider.models[0] ?? "")
    setCustomModel("")
    setResult(null)
  }, [provider])

  const effectiveModel = customModel.trim() || selectedModel

  const handleTest = useCallback(async () => {
    if (!provider || !effectiveModel) return
    setTesting(true)
    setResult(null)

    const startTime = performance.now()
    try {
      const baseUrl = provider.api_url.replace(/\/+$/, "")
      const url = baseUrl.endsWith("/chat/completions")
        ? baseUrl
        : `${baseUrl}/chat/completions`

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.api_key}`,
        },
        body: JSON.stringify({
          model: effectiveModel,
          messages: [
            { role: "user", content: "Hi, say hello in one sentence." },
          ],
          max_tokens: 64,
          stream: false,
        }),
      })

      const latencyMs = Math.round(performance.now() - startTime)

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "")
        let errorMsg = `HTTP ${response.status}`
        try {
          const parsed = JSON.parse(errorBody)
          errorMsg = parsed?.error?.message || parsed?.message || errorMsg
        } catch {
          if (errorBody.length > 0 && errorBody.length < 200) {
            errorMsg = errorBody
          }
        }
        setResult({
          success: false,
          latencyMs,
          message: errorMsg,
        })
        return
      }

      const data = await response.json()
      const content =
        data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? ""
      setResult({
        success: true,
        latencyMs,
        message: t("testSuccess"),
        preview: typeof content === "string" ? content.slice(0, 200) : "",
      })
    } catch (err) {
      const latencyMs = Math.round(performance.now() - startTime)
      setResult({
        success: false,
        latencyMs,
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
