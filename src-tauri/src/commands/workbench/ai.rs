//! Project System (PS) agent/session/chat proxy.
//!
//! These calls intentionally stay under the Workbench/PS session. They do not
//! reuse HouFlow credentials or HouFlow cloud targets: PS has its own users,
//! project membership, and assistant publish policy.

use serde_json::{json, Value as JsonValue};

use crate::app_error::AppCommandError;

use super::client::{ps_admin_get, ps_admin_post, ps_admin_post_text};
use super::space::{require_project_id, require_session};

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
    let project_id = require_project_id(&project_id)?;
    let assistant_id = require_assistant_id(&assistant_id)?;
    let session_id = require_session_id(&session_id)?;
    let query = query.trim().to_string();
    if query.is_empty() {
        return Err(AppCommandError::invalid_input("query is required"));
    }
    let session = require_session()?;
    let path = format!("/ai/agents/{}/messages", urlencoding::encode(&assistant_id));
    let raw = ps_admin_post_text(
        &session.host,
        &session.session_token,
        &project_id,
        &path,
        &[],
        json!({
            "threadId": session_id,
            "query": query,
        }),
    )
    .await?;
    Ok(json!({ "text": aggregate_chat_response(&raw) }))
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

fn aggregate_chat_response(raw: &str) -> String {
    let mut output = String::new();
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Ok(value) = serde_json::from_str::<JsonValue>(trimmed) {
            if value
                .get("status")
                .and_then(|status| status.as_str())
                .is_some_and(|status| status == "loading" || status == "finished")
            {
                if let Some(response) = value.get("response").and_then(|item| item.as_str()) {
                    merge_response_chunk(&mut output, response);
                }
                continue;
            }
            if let Some(text) = value
                .get("text")
                .or_else(|| value.get("message"))
                .and_then(|item| item.as_str())
            {
                merge_response_chunk(&mut output, text);
            }
            continue;
        }
        merge_response_chunk(&mut output, trimmed);
    }
    output
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
