"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { createModelProvider, fetchOpenAiCompatibleModels } from "@/lib/api"
import { CodexModelListEditor } from "@/components/settings/codex-model-list-editor"
import {
  MODEL_PROVIDER_AGENT_TYPES,
  AGENT_LABELS,
  serializeClaudeProviderModel,
  serializeCodexModelConfig,
  type AgentType,
  type ClaudeProviderModel,
  type CodexModelConfig,
} from "@/lib/types"

function normalizeModelList(raw: string): string[] {
  const seen = new Set<string>()
  return raw
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false
      seen.add(item)
      return true
    })
}

function mergeModelList(values: string[]): string[] {
  const seen = new Set<string>()
  return values
    .map((item) => item.trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false
      seen.add(item)
      return true
    })
}

function claudeModelValues(model: ClaudeProviderModel): string[] {
  return mergeModelList([
    model.main ?? "",
    model.reasoning ?? "",
    model.haiku ?? "",
    model.sonnet ?? "",
    model.opus ?? "",
    model.customOption ?? "",
  ])
}

interface AddModelProviderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onProviderAdded: () => void
  initialName?: string
  initialApiUrl?: string
}

export function AddModelProviderDialog({
  open,
  onOpenChange,
  onProviderAdded,
  initialName = "",
  initialApiUrl = "",
}: AddModelProviderDialogProps) {
  const t = useTranslations("ModelProviderSettings")
  const [loading, setLoading] = useState(false)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(initialName)
  const [apiUrl, setApiUrl] = useState(initialApiUrl)
  const [apiKey, setApiKey] = useState("")
  const [agentTypes, setAgentTypes] = useState<AgentType[]>([
    ...MODEL_PROVIDER_AGENT_TYPES,
  ])
  const [defaultModel, setDefaultModel] = useState("")
  const [modelsText, setModelsText] = useState("")
  const [claudeModel, setClaudeModel] = useState<ClaudeProviderModel>({})
  const [codexModel, setCodexModel] = useState<CodexModelConfig>({
    customs: [],
  })
  const includesClaude = agentTypes.includes("claude_code")
  const codexOnly = agentTypes.length === 1 && agentTypes[0] === "codex"

  const modelOptions = useMemo(
    () => normalizeModelList(modelsText),
    [modelsText]
  )
  const defaultModelOptions = useMemo(() => {
    const trimmed = defaultModel.trim()
    if (!trimmed || modelOptions.includes(trimmed)) return modelOptions
    return [trimmed, ...modelOptions]
  }, [defaultModel, modelOptions])

  const resetForm = useCallback(() => {
    setName(initialName)
    setApiUrl(initialApiUrl)
    setApiKey("")
    setAgentTypes([...MODEL_PROVIDER_AGENT_TYPES])
    setDefaultModel("")
    setModelsText("")
    setClaudeModel({})
    setCodexModel({ customs: [] })
    setError(null)
  }, [initialApiUrl, initialName])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) resetForm()
      onOpenChange(nextOpen)
    },
    [onOpenChange, resetForm]
  )

  useEffect(() => {
    if (!open) return
    setName(initialName)
    setApiUrl(initialApiUrl)
    setError(null)
  }, [initialApiUrl, initialName, open])

  const handleAgentTypeToggle = useCallback((agentType: AgentType) => {
    setAgentTypes((current) =>
      current.includes(agentType)
        ? current.filter((item) => item !== agentType)
        : [...current, agentType]
    )
  }, [])

  const handleFetchModels = useCallback(async () => {
    const baseUrl = apiUrl.trim()
    const key = apiKey.trim()
    if (!baseUrl) {
      setError(t("apiUrlRequired"))
      return
    }
    if (!key) {
      setError(t("apiKeyRequired"))
      return
    }

    setModelsLoading(true)
    setError(null)
    try {
      const models = mergeModelList(
        await fetchOpenAiCompatibleModels({ baseUrl, apiKey: key })
      )
      setModelsText(models.join("\n"))
      if (models.length === 0) {
        setError(t("fetchModelsEmpty"))
        return
      }
      if (!defaultModel.trim()) setDefaultModel(models[0])
      toast.success(t("fetchModelsSuccess"))
    } catch (err: unknown) {
      const raw = err as Record<string, unknown>
      const msg =
        typeof raw?.message === "string"
          ? raw.message
          : err instanceof Error
            ? err.message
            : String(err)
      setError(msg)
    } finally {
      setModelsLoading(false)
    }
  }, [apiUrl, apiKey, defaultModel, t])

  const modelPlaceholder = useMemo(() => {
    if (agentTypes.includes("codex") || agentTypes.includes("pi"))
      return t("modelPlaceholderCodex")
    if (agentTypes.includes("gemini")) return t("modelPlaceholderGemini")
    return ""
  }, [agentTypes, t])

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      setError(t("nameRequired"))
      return
    }
    if (!apiUrl.trim()) {
      setError(t("apiUrlRequired"))
      return
    }
    if (!apiKey.trim()) {
      setError(t("apiKeyRequired"))
      return
    }
    if (agentTypes.length === 0) {
      setError(t("agentTypesRequired"))
      return
    }

    const defaultModelValue = defaultModel.trim() || modelOptions[0] || ""
    const modelPayload = includesClaude
      ? serializeClaudeProviderModel({
          ...claudeModel,
          main: claudeModel.main?.trim() || defaultModelValue || undefined,
        })
      : codexOnly
        ? serializeCodexModelConfig(codexModel)
        : defaultModelValue || null
    const modelsPayload = codexOnly
      ? mergeModelList([
          codexModel.default ?? "",
          ...codexModel.customs.map((model) => model.slug),
        ])
      : modelOptions.length > 0
        ? modelOptions
        : modelPayload
          ? includesClaude
            ? claudeModelValues({
                ...claudeModel,
                main: claudeModel.main?.trim() || defaultModelValue,
              })
            : [modelPayload]
          : []

    setLoading(true)
    setError(null)
    try {
      await createModelProvider({
        name: name.trim(),
        apiUrl: apiUrl.trim(),
        apiKey: apiKey.trim(),
        agentType: agentTypes[0],
        agentTypes,
        model: modelPayload,
        models: modelsPayload,
      })
      toast.success(t("createSuccess"))
      handleOpenChange(false)
      onProviderAdded()
    } catch (err: unknown) {
      const raw = err as Record<string, unknown>
      const msg =
        typeof raw?.message === "string"
          ? raw.message
          : err instanceof Error
            ? err.message
            : String(err)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [
    name,
    apiUrl,
    apiKey,
    agentTypes,
    defaultModel,
    includesClaude,
    claudeModel,
    codexModel,
    codexOnly,
    modelOptions,
    handleOpenChange,
    onProviderAdded,
    t,
  ])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("addProvider")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("sectionDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="add-mp-name" className="text-xs font-medium">
              {t("providerName")}
            </label>
            <Input
              id="add-mp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("providerNamePlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="add-mp-url" className="text-xs font-medium">
              {t("apiUrl")}
            </label>
            <Input
              id="add-mp-url"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder={t("apiUrlPlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="add-mp-key" className="text-xs font-medium">
              {t("apiKey")}
            </label>
            <Input
              id="add-mp-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t("apiKeyPlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium">{t("agentTypes")}</label>
            <div className="grid gap-2 rounded-md border p-2">
              {MODEL_PROVIDER_AGENT_TYPES.map((at) => (
                <label
                  key={at}
                  className="flex items-center gap-2 text-xs text-foreground"
                >
                  <Checkbox
                    checked={agentTypes.includes(at)}
                    onCheckedChange={() => handleAgentTypeToggle(at)}
                  />
                  {AGENT_LABELS[at]}
                </label>
              ))}
            </div>
          </div>

          {codexOnly ? (
            <CodexModelListEditor value={codexModel} onChange={setCodexModel} />
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t("model")}</label>
              {modelOptions.length > 0 ? (
                <Select value={defaultModel} onValueChange={setDefaultModel}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder={defaultModelOptions[0]} />
                  </SelectTrigger>
                  <SelectContent>
                    {defaultModelOptions.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={defaultModel}
                  onChange={(e) => setDefaultModel(e.target.value)}
                  placeholder={modelPlaceholder}
                />
              )}
            </div>
          )}

          {includesClaude && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">
                  {t("claudeMainModel")}
                </label>
                <Input
                  value={claudeModel.main ?? ""}
                  onChange={(e) =>
                    setClaudeModel((prev) => ({
                      ...prev,
                      main: e.target.value,
                    }))
                  }
                  placeholder="claude-sonnet-5"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">
                  {t("claudeReasoningModel")}
                </label>
                <Input
                  value={claudeModel.reasoning ?? ""}
                  onChange={(e) =>
                    setClaudeModel((prev) => ({
                      ...prev,
                      reasoning: e.target.value,
                    }))
                  }
                  placeholder="claude-opus-4-8"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">
                  {t("claudeHaikuDefaultModel")}
                </label>
                <Input
                  value={claudeModel.haiku ?? ""}
                  onChange={(e) =>
                    setClaudeModel((prev) => ({
                      ...prev,
                      haiku: e.target.value,
                    }))
                  }
                  placeholder="claude-haiku-4-5"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">
                  {t("claudeSonnetDefaultModel")}
                </label>
                <Input
                  value={claudeModel.sonnet ?? ""}
                  onChange={(e) =>
                    setClaudeModel((prev) => ({
                      ...prev,
                      sonnet: e.target.value,
                    }))
                  }
                  placeholder="claude-sonnet-5"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-medium">
                  {t("claudeOpusDefaultModel")}
                </label>
                <Input
                  value={claudeModel.opus ?? ""}
                  onChange={(e) =>
                    setClaudeModel((prev) => ({
                      ...prev,
                      opus: e.target.value,
                    }))
                  }
                  placeholder="claude-opus-4-8"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-medium">
                  {t("claudeCustomModelOption")}
                </label>
                <Input
                  value={claudeModel.customOption ?? ""}
                  onChange={(e) =>
                    setClaudeModel((prev) => ({
                      ...prev,
                      customOption: e.target.value,
                    }))
                  }
                  placeholder="my-gateway/claude-opus-4-8"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">
                  {t("claudeCustomModelOptionName")}
                </label>
                <Input
                  value={claudeModel.customOptionName ?? ""}
                  onChange={(e) =>
                    setClaudeModel((prev) => ({
                      ...prev,
                      customOptionName: e.target.value,
                    }))
                  }
                  placeholder="Gateway Opus"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">
                  {t("claudeCustomModelOptionDescription")}
                </label>
                <Input
                  value={claudeModel.customOptionDescription ?? ""}
                  onChange={(e) =>
                    setClaudeModel((prev) => ({
                      ...prev,
                      customOptionDescription: e.target.value,
                    }))
                  }
                  placeholder="Routed via custom gateway"
                />
              </div>
              <p className="text-[11px] text-muted-foreground md:col-span-2">
                {t("claudeCustomModelOptionHint")}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="add-mp-models" className="text-xs font-medium">
                {t("availableModels")}
              </label>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={handleFetchModels}
                disabled={modelsLoading || loading}
              >
                {modelsLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                {t("fetchModels")}
              </Button>
            </div>
            <Textarea
              id="add-mp-models"
              value={modelsText}
              onChange={(e) => setModelsText(e.target.value)}
              className="min-h-24 font-mono text-xs"
              placeholder={"openai/deepseek-v4-flash\nopenai/gpt-5"}
            />
          </div>

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={loading || modelsLoading}
          >
            {t("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={loading || modelsLoading}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            {t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
