"use client"

import { useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import { useConnection } from "@/hooks/use-connection"

export function BackgroundTasksChip({ contextKey }: { contextKey: string }) {
  const t = useTranslations("Folder.chat.backgroundTasks")
  const { backgroundOutstanding } = useConnection(contextKey)

  if (backgroundOutstanding <= 0) return null

  return (
    <div className="border-b border-sky-500/20 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-700 dark:text-sky-300">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-center gap-2">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        <span className="min-w-0 truncate">
          {t("running", { count: backgroundOutstanding })}
        </span>
      </div>
    </div>
  )
}
