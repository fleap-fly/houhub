"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Loader2,
  Pencil,
  Play,
  Plus,
  Server,
  Sparkles,
  Trash2,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { listModelProviders, deleteModelProvider } from "@/lib/api"
import {
  MODEL_PROVIDER_AGENT_TYPES,
  AGENT_LABELS,
  type AgentType,
  type ModelProviderInfo,
} from "@/lib/types"
import { AddModelProviderDialog } from "./add-model-provider-dialog"
import { EditModelProviderDialog } from "./edit-model-provider-dialog"
import { TestModelProviderDialog } from "./test-model-provider-dialog"

const MODEL_PROVIDER_COPY = {
  zh: {
    sectionDescription:
      "登录 Houflow 后，订阅内的默认模型网关会自动同步到这里；手动供应商仅用于本地兼容运行时。",
    localProviders: "供应商",
    localProvidersDescription:
      "保存 API 地址、密钥和可用模型；智能体运行时只绑定并投影配置。",
    presets: "预设供应商",
    presetsDescription:
      "内置网关入口在这里统一配置，保存后会出现在下方供应商列表。",
    configure: "配置",
  },
  en: {
    sectionDescription:
      "After Houflow sign-in, the subscription model gateway is synced here automatically. Manual providers remain for local compatible runtimes.",
    localProviders: "Providers",
    localProvidersDescription:
      "Store API URL, key, and available models; agent runtimes bind and project their own config.",
    presets: "Preset providers",
    presetsDescription:
      "Built-in gateway entries are configured here, then saved into the provider list below.",
    configure: "Configure",
  },
} as const

const HOUSHAN_PROVIDER_PRESET = {
  name: "HouShan",
  apiUrl: "https://api.houshan.de/v1",
} as const

function providerSupportsAgent(
  provider: ModelProviderInfo,
  agentType: AgentType
): boolean {
  const types =
    provider.agent_types.length > 0
      ? provider.agent_types
      : [provider.agent_type]
  return types.includes(agentType)
}

export function ModelProviderSettings() {
  const t = useTranslations("ModelProviderSettings")
  const locale = useLocale()
  const copy = useMemo(
    () =>
      locale.toLowerCase().startsWith("zh")
        ? MODEL_PROVIDER_COPY.zh
        : MODEL_PROVIDER_COPY.en,
    [locale]
  )
  const [providers, setProviders] = useState<ModelProviderInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<AgentType | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addPreset, setAddPreset] = useState<
    typeof HOUSHAN_PROVIDER_PRESET | null
  >(null)
  const [editTarget, setEditTarget] = useState<ModelProviderInfo | null>(null)
  const [testTarget, setTestTarget] = useState<ModelProviderInfo | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ModelProviderInfo | null>(
    null
  )

  const loadProviders = useCallback(async () => {
    try {
      const rows = await listModelProviders()
      setProviders(rows)
    } catch {
      toast.error(t("loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadProviders().catch(console.error)
  }, [loadProviders])

  const filteredProviders = useMemo(() => {
    if (!filter) return providers
    return providers.filter((p) => providerSupportsAgent(p, filter))
  }, [providers, filter])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteModelProvider(deleteTarget.id)
      toast.success(t("deleteSuccess"))
      setDeleteTarget(null)
      await loadProviders()
    } catch (err: unknown) {
      const raw = err as Record<string, unknown>
      const msg =
        typeof raw?.message === "string"
          ? raw.message
          : err instanceof Error
            ? err.message
            : String(err)
      const prefix = "PROVIDER_IN_USE:"
      if (msg.includes(prefix)) {
        const agentNames = msg.substring(msg.indexOf(prefix) + prefix.length)
        toast.error(t("deleteBlockedByAgent", { agents: agentNames }))
      } else {
        toast.error(msg)
      }
    }
  }, [deleteTarget, loadProviders, t])

  return (
    <ScrollArea className="h-full">
      <section className="space-y-3 px-3 pt-3 md:px-4 md:pt-4">
        <div>
          <h1 className="text-sm font-semibold">{t("sectionTitle")}</h1>
          <p className="text-sm text-muted-foreground">
            {copy.sectionDescription}
          </p>
        </div>
      </section>

      <section className="mt-4 space-y-2 px-3 md:px-4">
        <div>
          <h2 className="text-sm font-medium">{copy.presets}</h2>
          <p className="text-xs text-muted-foreground">
            {copy.presetsDescription}
          </p>
        </div>
        <div className="rounded-md border px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="truncate text-sm font-medium">
                  {HOUSHAN_PROVIDER_PRESET.name}
                </div>
                <div className="truncate font-mono text-xs text-muted-foreground">
                  {HOUSHAN_PROVIDER_PRESET.apiUrl}
                </div>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 shrink-0 text-xs"
              onClick={() => {
                setAddPreset(HOUSHAN_PROVIDER_PRESET)
                setAddDialogOpen(true)
              }}
            >
              {copy.configure}
            </Button>
          </div>
        </div>
      </section>

      <section className="mt-4 space-y-2 px-3 pb-3 md:px-4 md:pb-4">
        <div>
          <h2 className="text-sm font-medium">{copy.localProviders}</h2>
          <p className="text-xs text-muted-foreground">
            {copy.localProvidersDescription}
          </p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Select
            value={filter ?? "__all__"}
            onValueChange={(v) =>
              setFilter(v === "__all__" ? null : (v as AgentType))
            }
          >
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("filterAll")}</SelectItem>
              {MODEL_PROVIDER_AGENT_TYPES.map((at) => (
                <SelectItem key={at} value={at}>
                  {AGENT_LABELS[at]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={() => setAddDialogOpen(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t("addProvider")}
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredProviders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Server className="h-8 w-8 mb-2 opacity-40" />
            <span className="text-xs">{t("noProviders")}</span>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredProviders.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5"
              >
                <div className="min-w-0 flex-1 flex items-center gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="truncate text-xs text-muted-foreground font-mono">
                      {p.api_url}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {(p.agent_types.length > 0
                      ? p.agent_types
                      : [p.agent_type]
                    ).map((agentType) => (
                      <Badge
                        key={agentType}
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0"
                      >
                        {AGENT_LABELS[agentType] ?? agentType}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title={t("testProvider")}
                    onClick={() => setTestTarget(p)}
                  >
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setEditTarget(p)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => setDeleteTarget(p)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <AddModelProviderDialog
        open={addDialogOpen}
        initialName={addPreset?.name}
        initialApiUrl={addPreset?.apiUrl}
        onOpenChange={(open) => {
          setAddDialogOpen(open)
          if (!open) setAddPreset(null)
        }}
        onProviderAdded={loadProviders}
      />

      <EditModelProviderDialog
        provider={editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
        onProviderUpdated={loadProviders}
      />

      <TestModelProviderDialog
        provider={testTarget}
        onOpenChange={(open) => {
          if (!open) setTestTarget(null)
        }}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfirmMessage", { name: deleteTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScrollArea>
  )
}
