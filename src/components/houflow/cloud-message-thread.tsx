"use client"

import { useMemo } from "react"
import type { LinkSafetyConfig } from "streamdown"
import { StreamdownLinkSafetyProvider } from "@/components/ai-elements/link-safety"
import { Message, MessageContent } from "@/components/ai-elements/message"
import { ContentPartsRenderer } from "@/components/message/content-parts-renderer"
import { TurnStats } from "@/components/message/turn-stats"
import type { AdaptedMessage } from "@/lib/adapters/ai-elements-adapter"
import type { MessageTurn } from "@/lib/types"
import { cn } from "@/lib/utils"

export function CloudMessageThread({
  messages,
  turns,
  linkSafety,
}: {
  messages: AdaptedMessage[]
  turns: MessageTurn[]
  linkSafety: LinkSafetyConfig
}) {
  const turnsById = useMemo(
    () => new Map(turns.map((turn) => [turn.id, turn])),
    [turns]
  )

  return (
    <>
      {messages.map((message) => {
        const messageRole = toMessageRole(message.role)
        const turn = turnsById.get(message.id)
        return (
          <div key={message.id}>
            <Message
              from={messageRole}
              className={cn(
                messageRole === "assistant" && "max-w-full",
                messageRole === "system" && "max-w-full opacity-80"
              )}
            >
              <MessageContent>
                <StreamdownLinkSafetyProvider value={linkSafety}>
                  <ContentPartsRenderer
                    parts={message.content}
                    role={message.role}
                  />
                </StreamdownLinkSafetyProvider>
                {messageRole !== "assistant" ? (
                  <div className="text-[0.6875rem] text-muted-foreground">
                    {formatTimestamp(message.completed_at ?? message.timestamp)}
                  </div>
                ) : null}
              </MessageContent>
            </Message>
            {messageRole === "assistant" ? (
              <TurnStats
                usage={turn?.usage}
                duration_ms={turn?.duration_ms}
                model={turn?.model}
                copyText={copyTextForTurn(turn)}
                completedAt={turn?.completed_at ?? message.completed_at}
              />
            ) : null}
          </div>
        )
      })}
    </>
  )
}

function toMessageRole(role: string): "user" | "assistant" | "system" {
  return role === "user" || role === "assistant" || role === "system"
    ? role
    : "assistant"
}

function copyTextForTurn(turn: MessageTurn | undefined): string {
  if (!turn) return ""
  return turn.blocks
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .filter((text) => text.trim().length > 0)
    .join("\n")
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return ""
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString()
}
