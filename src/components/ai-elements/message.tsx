"use client"

import type { UIMessage } from "ai"
import type { ComponentProps, HTMLAttributes, ReactElement } from "react"

import { Button } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  Streamdown,
  defaultRehypePlugins,
  defaultRemarkPlugins,
} from "streamdown"
import { markdownLinkComponents } from "./markdown-link"
import { maskLiteralSpans } from "./markdown-mask"
import { mermaidComponents } from "./mermaid-block"
import { rehypePluginsAllowingHouhub } from "./rehype-allow-houhub"
import { remarkTrimCjkAutolinkTail } from "./remark-cjk-autolink-tail"
import { remarkRewriteFileUriLinks } from "./remark-file-uri-links"
import { remarkRestoreWindowsPaths } from "./remark-windows-paths"
import { MATH_FENCE_PAD, useStreamdownPlugins } from "./streamdown-plugins"

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"]
}

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full flex-col gap-2",
      from === "user"
        ? "is-user ml-auto justify-end max-w-[88%]"
        : "is-assistant",
      className
    )}
    {...props}
  />
)

export type MessageContentProps = HTMLAttributes<HTMLDivElement>

export const MessageContent = ({
  children,
  className,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(
      "is-user:dark flex min-w-0 flex-col gap-2 overflow-hidden text-sm",
      // `ws-msg-secondary` pairs with the user bubble's `bg-secondary`: with
      // a workspace background image on it turns the bubble translucent + frosted
      // with a hairline ring (fixed `--ws-msg-alpha` + backdrop blur — see
      // globals.css, scoped to `.is-user`) so it stays legible over a busy
      // background. Off / assistant messages: inert (no base rule, no `.is-user`
      // ancestor).
      "group-[.is-user]:ml-auto group-[.is-user]:w-fit group-[.is-user]:max-w-full group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground ws-msg-secondary",
      "group-[.is-assistant]:w-full group-[.is-assistant]:text-foreground",
      className
    )}
    {...props}
  >
    {children}
  </div>
)

export type MessageActionsProps = ComponentProps<"div">

export const MessageActions = ({
  className,
  children,
  ...props
}: MessageActionsProps) => (
  <div className={cn("flex items-center gap-1", className)} {...props}>
    {children}
  </div>
)

export type MessageActionProps = ComponentProps<typeof Button> & {
  tooltip?: string
  label?: string
}

export const MessageAction = ({
  tooltip,
  children,
  label,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: MessageActionProps) => {
  const button = (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  )

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return button
}

interface MessageBranchContextType {
  currentBranch: number
  totalBranches: number
  goToPrevious: () => void
  goToNext: () => void
  branches: ReactElement[]
  setBranches: (branches: ReactElement[]) => void
}

const MessageBranchContext = createContext<MessageBranchContextType | null>(
  null
)

const useMessageBranch = () => {
  const context = useContext(MessageBranchContext)

  if (!context) {
    throw new Error(
      "MessageBranch components must be used within MessageBranch"
    )
  }

  return context
}

export type MessageBranchProps = HTMLAttributes<HTMLDivElement> & {
  defaultBranch?: number
  onBranchChange?: (branchIndex: number) => void
}

export const MessageBranch = ({
  defaultBranch = 0,
  onBranchChange,
  className,
  ...props
}: MessageBranchProps) => {
  const [currentBranch, setCurrentBranch] = useState(defaultBranch)
  const [branches, setBranches] = useState<ReactElement[]>([])

  const handleBranchChange = useCallback(
    (newBranch: number) => {
      setCurrentBranch(newBranch)
      onBranchChange?.(newBranch)
    },
    [onBranchChange]
  )

  const goToPrevious = useCallback(() => {
    const newBranch =
      currentBranch > 0 ? currentBranch - 1 : branches.length - 1
    handleBranchChange(newBranch)
  }, [currentBranch, branches.length, handleBranchChange])

  const goToNext = useCallback(() => {
    const newBranch =
      currentBranch < branches.length - 1 ? currentBranch + 1 : 0
    handleBranchChange(newBranch)
  }, [currentBranch, branches.length, handleBranchChange])

  const contextValue = useMemo<MessageBranchContextType>(
    () => ({
      branches,
      currentBranch,
      goToNext,
      goToPrevious,
      setBranches,
      totalBranches: branches.length,
    }),
    [branches, currentBranch, goToNext, goToPrevious]
  )

  return (
    <MessageBranchContext.Provider value={contextValue}>
      <div
        className={cn("grid w-full gap-2 [&>div]:pb-0", className)}
        {...props}
      />
    </MessageBranchContext.Provider>
  )
}

export type MessageBranchContentProps = HTMLAttributes<HTMLDivElement>

export const MessageBranchContent = ({
  children,
  ...props
}: MessageBranchContentProps) => {
  const { currentBranch, setBranches, branches } = useMessageBranch()
  const childrenArray = useMemo(
    () => (Array.isArray(children) ? children : [children]),
    [children]
  )

  // Use useEffect to update branches when they change
  useEffect(() => {
    if (branches.length !== childrenArray.length) {
      setBranches(childrenArray)
    }
  }, [childrenArray, branches, setBranches])

  return childrenArray.map((branch, index) => (
    <div
      className={cn(
        "grid gap-2 overflow-hidden [&>div]:pb-0",
        index === currentBranch ? "block" : "hidden"
      )}
      key={branch.key}
      {...props}
    >
      {branch}
    </div>
  ))
}

export type MessageBranchSelectorProps = ComponentProps<typeof ButtonGroup>

export const MessageBranchSelector = ({
  className,
  ...props
}: MessageBranchSelectorProps) => {
  const { totalBranches } = useMessageBranch()

  // Don't render if there's only one branch
  if (totalBranches <= 1) {
    return null
  }

  return (
    <ButtonGroup
      className={cn(
        "[&>*:not(:first-child)]:rounded-l-md [&>*:not(:last-child)]:rounded-r-md",
        className
      )}
      orientation="horizontal"
      {...props}
    />
  )
}

export type MessageBranchPreviousProps = ComponentProps<typeof Button>

export const MessageBranchPrevious = ({
  children,
  ...props
}: MessageBranchPreviousProps) => {
  const t = useTranslations("Folder.chat.messageBranch")
  const { goToPrevious, totalBranches } = useMessageBranch()

  return (
    <Button
      aria-label={t("previousBranchAria")}
      disabled={totalBranches <= 1}
      onClick={goToPrevious}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronLeftIcon size={14} />}
    </Button>
  )
}

export type MessageBranchNextProps = ComponentProps<typeof Button>

export const MessageBranchNext = ({
  children,
  ...props
}: MessageBranchNextProps) => {
  const t = useTranslations("Folder.chat.messageBranch")
  const { goToNext, totalBranches } = useMessageBranch()

  return (
    <Button
      aria-label={t("nextBranchAria")}
      disabled={totalBranches <= 1}
      onClick={goToNext}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronRightIcon size={14} />}
    </Button>
  )
}

export type MessageBranchPageProps = HTMLAttributes<HTMLSpanElement>

export const MessageBranchPage = ({
  className,
  ...props
}: MessageBranchPageProps) => {
  const t = useTranslations("Folder.chat.messageBranch")
  const { currentBranch, totalBranches } = useMessageBranch()

  return (
    <ButtonGroupText
      className={cn(
        "border-none bg-transparent text-muted-foreground shadow-none",
        className
      )}
      {...props}
    >
      {t("pageOf", { current: currentBranch + 1, total: totalBranches })}
    </ButtonGroupText>
  )
}

// MessageResponse renders ASSISTANT / agent Markdown. User messages no longer
// use it — they render as plain text + reference badges via PlainTextWithBadges
// (see message/plain-text-with-badges.tsx) — so the former user-only `softBreaks`
// / `/slash`-badging hooks were removed.
export type MessageResponseProps = ComponentProps<typeof Streamdown>

// remark-math uses dollar delimiters. Single-dollar math is disabled so
// currency and shell variables remain prose. LaTeX-style delimiters are
// rewritten to double-dollar fences, with a zero-width pad where CommonMark
// would otherwise treat a multiline opener/closer as a block fence.
export function normalizeMathDelimiters(text: string): string {
  const { masked, restore } = maskLiteralSpans(text)
  const source = masked.replace(/\r\n|\r/g, "\n")
  const normalized = source
    .replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner: string) => `$$${inner}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner: string, offset: number) => {
      if (!inner.includes("\n")) return `$$${inner}$$`
      const lineStart = source.lastIndexOf("\n", offset - 1) + 1
      const atContentStart =
        containerPrefixEnd(source, lineStart, offset) === offset
      const open = atContentStart ? MATH_FENCE_PAD : ""
      return `${open}$$${inner}${MATH_FENCE_PAD}$$`
    })
  return restore(normalized)
}

function isSpaceOrTab(code: number): boolean {
  return code === 32 || code === 9
}

function containerPrefixEnd(
  source: string,
  start: number,
  end: number
): number {
  let i = start
  for (;;) {
    while (i < end && isSpaceOrTab(source.charCodeAt(i))) i += 1
    if (i >= end) return i

    const ch = source.charCodeAt(i)
    if (ch === 62) {
      i += 1
      continue
    }

    if (ch === 42 || ch === 45 || ch === 43) {
      if (i + 1 < end && isSpaceOrTab(source.charCodeAt(i + 1))) {
        i += 2
        continue
      }
      return i
    }

    if (ch >= 48 && ch <= 57) {
      let j = i
      let digits = 0
      while (
        j < end &&
        digits < 9 &&
        source.charCodeAt(j) >= 48 &&
        source.charCodeAt(j) <= 57
      ) {
        digits += 1
        j += 1
      }
      const marker = j < end ? source.charCodeAt(j) : 0
      if (
        (marker === 46 || marker === 41) &&
        j + 1 < end &&
        isSpaceOrTab(source.charCodeAt(j + 1))
      ) {
        i = j + 2
        continue
      }
      return i
    }

    return i
  }
}

const remarkPlugins = [
  ...Object.values(defaultRemarkPlugins),
  remarkRestoreWindowsPaths,
  remarkRewriteFileUriLinks,
  remarkTrimCjkAutolinkTail,
]

// Streamdown's default rehype pipeline strips `houhub://` reference hrefs in
// sanitization (rendering them as "[blocked]"); re-derive it so they survive to
// MarkdownLink → ReferenceBadge. See rehype-allow-houhub for the full rationale.
const rehypePlugins = rehypePluginsAllowingHouhub(defaultRehypePlugins)

function MessageResponseImpl({
  className,
  children,
  ...props
}: MessageResponseProps) {
  const normalized = useMemo(
    () =>
      typeof children === "string"
        ? normalizeMathDelimiters(children)
        : children,
    [children]
  )
  const plugins = useStreamdownPlugins(
    typeof normalized === "string" ? normalized : undefined
  )

  return (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-3 [&_ol]:pl-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:not-italic",
        className
      )}
      plugins={plugins}
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      {...props}
      // Merge after spreading props so a caller can still override other
      // elements, but the link icon + safety routing on `a` — and the diagram
      // block on `pre` — always win.
      components={{
        ...props.components,
        ...markdownLinkComponents,
        ...mermaidComponents,
      }}
    >
      {normalized}
    </Streamdown>
  )
}

export const MessageResponse = memo(
  MessageResponseImpl,
  (prevProps, nextProps) => prevProps.children === nextProps.children
)

MessageResponse.displayName = "MessageResponse"

export type MessageToolbarProps = ComponentProps<"div">

export const MessageToolbar = ({
  className,
  children,
  ...props
}: MessageToolbarProps) => (
  <div
    className={cn(
      "mt-4 flex w-full items-center justify-between gap-4",
      className
    )}
    {...props}
  >
    {children}
  </div>
)
