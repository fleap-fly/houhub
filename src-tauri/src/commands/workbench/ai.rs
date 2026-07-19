//! Project System (PS) agent/session/chat proxy.
//!
//! These calls intentionally stay under the Workbench/PS session. They do not
//! reuse HouFlow credentials or HouFlow cloud targets: PS has its own users,
//! project membership, and assistant publish policy.

use serde::Serialize;
use serde_json::{json, Value as JsonValue};

use crate::app_error::AppCommandError;
use crate::web::event_bridge::{emit_event, EventEmitter};

use super::client::{ps_admin_get, ps_admin_post, ps_admin_post_ndjson};
use super::space::{require_project_id, require_session};

pub const WORKBENCH_AI_MESSAGE_STREAM_EVENT: &str = "workbench-ai://message-stream";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkbenchAiMessageStreamFrame<'a> {
    request_id: &'a str,
    status: &'a str,
    response: &'a str,
}

pub async fn workbench_ai_list_assistants_core(
    project_id: String,
) -> Result<JsonValue, AppCommandError> {
    let project_id = require_project_id(&project_id)?;
    let session = require_session()?;
    ps_admin_get(
        &session.host,
        &session.session_token,
        &project_id,
        "/ai/agents",
        &[],
    )
    .await
}

pub async fn workbench_ai_list_sessions_core(
    project_id: String,
    assistant_id: Option<String>,
    limit: Option<i64>,
) -> Result<JsonValue, AppCommandError> {
    let project_id = require_project_id(&project_id)?;
    let session = require_session()?;
    let agent_id = assistant_id
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppCommandError::invalid_input("assistantId is required"))?;
    let limit = limit.unwrap_or(40).clamp(1, 120).to_string();
    ps_admin_get(
        &session.host,
        &session.session_token,
        &project_id,
        "/ai/threads",
        &[("agentId", agent_id), ("limit", limit.as_str())],
    )
    .await
}

pub async fn workbench_ai_create_session_core(
    project_id: String,
    assistant_id: Option<String>,
    title: Option<String>,
) -> Result<JsonValue, AppCommandError> {
    let project_id = require_project_id(&project_id)?;
    let session = require_session()?;
    let agent_id = assistant_id
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppCommandError::invalid_input("assistantId is required"))?;
    let mut body = json!({ "agentId": agent_id });
    if let Some(title) = title
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        body["title"] = json!(title);
    }
    ps_admin_post(
        &session.host,
        &session.session_token,
        &project_id,
        "/ai/threads",
        &[],
        body,
    )
    .await
}

pub async fn workbench_ai_get_session_core(
    project_id: String,
    session_id: String,
) -> Result<JsonValue, AppCommandError> {
    let project_id = require_project_id(&project_id)?;
    let session_id = require_session_id(&session_id)?;
    let session = require_session()?;
    let agent_id = extract_agent_id_from_session_id(&session_id)
        .ok_or_else(|| AppCommandError::invalid_input("sessionId is missing agent namespace"))?;
    let path = format!("/ai/agents/{}/history", urlencoding::encode(&agent_id));
    ps_admin_get(
        &session.host,
        &session.session_token,
        &project_id,
        &path,
        &[("threadId", session_id.as_str())],
    )
    .await
}

pub async fn workbench_ai_send_message_core(
    project_id: String,
    assistant_id: String,
    session_id: String,
    query: String,
) -> Result<JsonValue, AppCommandError> {
    workbench_ai_send_message_stream_core(
        project_id,
        assistant_id,
        session_id,
        query,
        String::new(),
        EventEmitter::Noop,
    )
    .await
}

pub async fn workbench_ai_send_message_stream_core(
    project_id: String,
    assistant_id: String,
    session_id: String,
    query: String,
    request_id: String,
    emitter: EventEmitter,
) -> Result<JsonValue, AppCommandError> {
    let project_id = require_project_id(&project_id)?;
    let assistant_id = require_assistant_id(&assistant_id)?;
    let session_id = require_session_id(&session_id)?;
    let query = query.trim().to_string();
    if query.is_empty() {
        return Err(AppCommandError::invalid_input("query is required"));
    }
    let session = require_session()?;
    let path = format!("/ai/agents/{}/messages", urlencoding::encode(&assistant_id));
    let mut output = String::new();
    let mut stream_error = None;
    ps_admin_post_ndjson(
        &session.host,
        &session.session_token,
        &project_id,
        &path,
        &[],
        json!({
            "threadId": session_id,
            "query": query,
        }),
        |line| {
            if let Some(message) = chat_error_line(line) {
                stream_error = Some(message);
                return;
            }
            let Some((status, response)) = chat_response_line(line) else {
                return;
            };
            merge_response_chunk(&mut output, &response);
            if !request_id.is_empty() && !response.is_empty() {
                emit_event(
                    &emitter,
                    WORKBENCH_AI_MESSAGE_STREAM_EVENT,
                    WorkbenchAiMessageStreamFrame {
                        request_id: &request_id,
                        status: &status,
                        response: &response,
                    },
                );
            }
        },
    )
    .await?;
    if let Some(message) = stream_error {
        return Err(AppCommandError::external_command(
            "project assistant failed",
            message,
        ));
    }
    if !request_id.is_empty() {
        emit_event(
            &emitter,
            WORKBENCH_AI_MESSAGE_STREAM_EVENT,
            WorkbenchAiMessageStreamFrame {
                request_id: &request_id,
                status: "finished",
                response: &output,
            },
        );
    }
    Ok(json!({ "text": output }))
}

fn require_assistant_id(value: &str) -> Result<String, AppCommandError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppCommandError::invalid_input("assistantId is required"));
    }
    Ok(trimmed.to_string())
}

fn require_session_id(value: &str) -> Result<String, AppCommandError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppCommandError::invalid_input("sessionId is required"));
    }
    Ok(trimmed.to_string())
}

fn extract_agent_id_from_session_id(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if !trimmed.starts_with("agent:") {
        return None;
    }
    let mut parts = trimmed.split(':');
    let prefix = parts.next()?;
    let agent_id = parts.next()?;
    if prefix == "agent" && !agent_id.is_empty() {
        Some(agent_id.to_string())
    } else {
        None
    }
}

fn chat_response_line(line: &str) -> Option<(String, String)> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }
    let Ok(value) = serde_json::from_str::<JsonValue>(trimmed) else {
        return Some(("loading".to_string(), trimmed.to_string()));
    };
    let status = value
        .get("status")
        .and_then(|item| item.as_str())
        .unwrap_or("loading");
    if status == "error" || status == "init" {
        return None;
    }
    value
        .get("response")
        .or_else(|| value.get("text"))
        .or_else(|| value.get("message"))
        .and_then(|item| item.as_str())
        .map(|response| (status.to_string(), response.to_string()))
}

fn chat_error_line(line: &str) -> Option<String> {
    let value = serde_json::from_str::<JsonValue>(line.trim()).ok()?;
    if value.get("status").and_then(|item| item.as_str()) != Some("error") {
        return None;
    }
    Some(
        value
            .get("error_message")
            .or_else(|| value.get("message"))
            .and_then(|item| item.as_str())
            .unwrap_or("Project assistant failed")
            .to_string(),
    )
}

fn merge_response_chunk(output: &mut String, chunk: &str) {
    if chunk.is_empty() {
        return;
    }
    if chunk == output.as_str() || output.ends_with(chunk) {
        return;
    }
    if chunk.starts_with(output.as_str()) {
        output.clear();
        output.push_str(chunk);
        return;
    }
    output.push_str(chunk);
}
