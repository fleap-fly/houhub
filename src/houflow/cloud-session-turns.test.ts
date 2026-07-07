import { describe, expect, it } from "vitest"
import { houflowCloudEventsToTurns } from "./cloud-session-turns"
import type { HouflowCloudSessionEvent } from "./cloud-sessions"

describe("houflowCloudEventsToTurns", () => {
  it("maps Agent Hub text, reasoning and tool events into reusable message turns", () => {
    const turns = houflowCloudEventsToTurns([
      event({
        id: "evt_user",
        type: "user.message",
        content: [{ type: "text", text: "开始" }],
      }),
      event({
        id: "evt_reasoning",
        type: "agent.message",
        content: [{ type: "thinking", text: "分析中" }],
      }),
      event({
        id: "evt_tool",
        type: "agent.message",
        content: [
          {
            type: "tool_use",
            id: "call_1",
            name: "Read",
            input: { file_path: "README.md" },
          },
          {
            type: "tool_result",
            tool_use_id: "call_1",
            content: [{ type: "text", text: "ok" }],
          },
        ],
      }),
    ])

    expect(turns).toEqual([
      {
        id: "evt_user",
        role: "user",
        blocks: [{ type: "text", text: "开始" }],
        timestamp: "2026-06-28T00:00:00.000Z",
        completed_at: "2026-06-28T00:00:00.000Z",
      },
      {
        id: "evt_reasoning",
        role: "assistant",
        blocks: [{ type: "thinking", text: "分析中" }],
        timestamp: "2026-06-28T00:00:00.000Z",
        completed_at: "2026-06-28T00:00:00.000Z",
      },
      {
        id: "evt_tool",
        role: "assistant",
        blocks: [
          {
            type: "tool_use",
            tool_use_id: "call_1",
            tool_name: "Read",
            input_preview: '{"file_path":"README.md"}',
            meta: null,
          },
          {
            type: "tool_result",
            tool_use_id: "call_1",
            output_preview: "ok",
            is_error: false,
          },
        ],
        timestamp: "2026-06-28T00:00:00.000Z",
        completed_at: "2026-06-28T00:00:00.000Z",
      },
    ])
  })

  it("filters lifecycle and machine artifact status events but keeps user-facing messages", () => {
    const turns = houflowCloudEventsToTurns([
      event({
        id: "evt_idle",
        type: "session.status_idle",
        message: "Session is idle.",
      }),
      event({
        id: "evt_hosted_idle",
        type: "hosted.event",
        message: "Session is idle.",
      }),
      event({
        id: "evt_hosted_queued",
        type: "hosted.event",
        message: "Session run queued.",
      }),
      event({
        id: "evt_dispatch",
        type: "runtime.status",
        message: "Hosted A2A dispatch started",
      }),
      event({
        id: "evt_hosted_dispatch",
        type: "hosted.event",
        message: "Runtime Plane native message dispatch started.",
      }),
      event({
        id: "evt_manifest",
        type: "agent.message",
        content: [
          {
            type: "text",
            text: "normalized_spec=tmp/normalized_exam_spec.json exam_html=written art_prompts=written polish_prompts=written proof_front=written published_outputs=exam.html,exam_paper_front.png internal_files=11 internal_manifest=tmp/render_outputs/render_manifest.json",
          },
        ],
      }),
      event({
        id: "evt_check_json",
        type: "agent.message",
        content: [
          {
            type: "text",
            text: '{"checked":[{"image":"outputs/exam_paper_front.png","job_id":"65308652316057600","quality_flags":[],"raw_text_chars":1514,"structural_image_ma":true}]}',
          },
        ],
      }),
      event({
        id: "evt_real",
        type: "agent.message",
        content: [{ type: "text", text: "试卷已经生成，可以在右侧查看文件。" }],
      }),
    ])

    expect(turns).toHaveLength(1)
    expect(turns[0]).toMatchObject({
      id: "evt_real",
      role: "assistant",
      blocks: [{ type: "text", text: "试卷已经生成，可以在右侧查看文件。" }],
    })
  })

  it("maps object-form Agent Hub content blocks", () => {
    const turns = houflowCloudEventsToTurns([
      event({
        id: "evt_object_content",
        type: "agent.message",
        content: {
          type: "tool_use",
          id: "call_1",
          name: "Read",
          input: { file_path: "outputs/report.md" },
        },
      }),
    ])

    expect(turns).toEqual([
      {
        id: "evt_object_content",
        role: "assistant",
        blocks: [
          {
            type: "tool_use",
            tool_use_id: "call_1",
            tool_name: "Read",
            input_preview: '{"file_path":"outputs/report.md"}',
            meta: null,
          },
        ],
        timestamp: "2026-06-28T00:00:00.000Z",
        completed_at: "2026-06-28T00:00:00.000Z",
      },
    ])
  })

  it("maps Agent Hub tool events into the local tool/delegation renderer shape", () => {
    const turns = houflowCloudEventsToTurns([
      event({
        id: "evt_delegate",
        type: "agent.tool_use",
        name: "mcp__houhub-mcp__delegate_to_agent",
        tool_use_id: "call_delegate",
        input: { agent: "codex", task: "检查诗歌题" },
        metadata: {
          "houhub.delegation": {
            status: "running",
            child_conversation_id: "42",
          },
        },
      }),
      event({
        id: "evt_status",
        type: "agent.tool_result",
        tool_use_id: "call_delegate",
        content: [
          {
            type: "text",
            text: "task_id=abc. Call get_delegation_status later.",
          },
        ],
      }),
      event({
        id: "evt_poll",
        type: "agent.tool_use",
        name: "get_delegation_status",
        tool_use_id: "call_poll",
        input: { task_ids: ["abc"] },
      }),
      event({
        id: "evt_poll_result",
        type: "agent.tool_result",
        tool_use_id: "call_poll",
        content: [
          {
            type: "text",
            text: '{"tasks":[{"task_id":"abc","status":"running","text":"Running."}]}',
          },
        ],
      }),
    ])

    expect(turns).toHaveLength(2)
    expect(turns[0]?.blocks[0]).toMatchObject({
      type: "tool_use",
      tool_use_id: "call_delegate",
      tool_name: "mcp__houhub-mcp__delegate_to_agent",
      input_preview: '{"agent":"codex","task":"检查诗歌题"}',
      meta: {
        "houhub.delegation": {
          status: "running",
          child_conversation_id: "42",
        },
      },
    })
    expect(turns[1]?.blocks[0]).toMatchObject({
      type: "tool_use",
      tool_use_id: "call_poll",
      tool_name: "get_delegation_status",
    })
    expect(turns[1]?.blocks[1]).toMatchObject({
      type: "tool_result",
      tool_use_id: "call_poll",
      output_preview:
        '{"tasks":[{"task_id":"abc","status":"running","text":"Running."}]}',
    })
    expect(turns[0]?.blocks[1]).toMatchObject({
      type: "tool_result",
      tool_use_id: "call_delegate",
      output_preview: "task_id=abc. Call get_delegation_status later.",
    })
  })
})

function event(raw: Record<string, unknown>): HouflowCloudSessionEvent {
  return {
    id: String(raw.id),
    type: String(raw.type),
    role: null,
    text: null,
    createdAt: "2026-06-28T00:00:00.000Z",
    raw,
  }
}
