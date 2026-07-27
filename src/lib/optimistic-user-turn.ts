import {
  extractUserImagesFromDraft,
  getPromptDraftDisplayText,
} from "@/lib/prompt-draft"
import type { ContentBlock, MessageTurn, PromptDraft } from "@/lib/types"
import { randomUUID } from "@/lib/utils"

export function buildOptimisticUserTurnFromDraft(
  draft: PromptDraft,
  attachedResourcesFallback: string
): MessageTurn {
  const text = getPromptDraftDisplayText(draft, attachedResourcesFallback)

  const blocks: ContentBlock[] = []
  for (const image of extractUserImagesFromDraft(draft)) {
    blocks.push({
      type: "image",
      data: image.data,
      mime_type: image.mime_type,
      uri: image.uri ?? null,
    })
  }
  blocks.push({ type: "text", text })

  return {
    id: `optimistic-${randomUUID()}`,
    role: "user",
    blocks,
    timestamp: new Date().toISOString(),
  }
}
