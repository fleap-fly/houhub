//! PS device-code handshake, session retrieval, project listing & sign-out.

use serde_json::Value as JsonValue;

use crate::app_error::AppCommandError;

use super::client::{
    http_client, normalize_host, parse_json, pending_hosts, request_error, API_PREFIX, CLIENT_ID,
    DEFAULT_HOST, DESKTOP_SESSION_HEADER,
};
use super::store::{load_stored, persist_stored};
use super::types::{
    session_from_stored, DeviceAuthPollResult, DeviceAuthStart, PsDeviceAuthPoll, WorkbenchProject,
    WorkbenchSession, WorkbenchStored,
};

pub async fn workbench_begin_device_auth_core(
    host: Option<String>,
) -> Result<DeviceAuthStart, AppCommandError> {
    let host = normalize_host(&host.unwrap_or_default());
    let url = format!("{host}{API_PREFIX}/public/desktop/auth-sessions");
    let resp = http_client()?
        .post(&url)
        .json(&serde_json::json!({ "clientId": CLIENT_ID }))
        .send()
        .await
        .map_err(request_error)?;
    let start: DeviceAuthStart = parse_json(resp).await?;
    if let Ok(mut map) = pending_hosts().lock() {
        map.insert(start.device_code.clone(), host);
    }
    Ok(start)
}

pub async fn workbench_poll_device_auth_core(
    device_code: String,
) -> Result<DeviceAuthPollResult, AppCommandError> {
    let device_code = device_code.trim().to_string();
    if device_code.is_empty() {
        return Err(AppCommandError::invalid_input("deviceCode is required"));
    }
    let host = pending_hosts()
        .lock()
        .ok()
        .and_then(|map| map.get(&device_code).cloned())
        .unwrap_or_else(|| DEFAULT_HOST.to_string());

    let url = format!("{host}{API_PREFIX}/public/desktop/auth-sessions/{device_code}/poll");
    let resp = http_client()?
        .post(&url)
        .send()
        .await
        .map_err(request_error)?;
    let poll: PsDeviceAuthPoll = parse_json(resp).await?;

    if poll.status == "approved" {
        if let (Some(token), Some(project_id), Some(user)) = (
            poll.session_token.clone(),
            poll.active_project_id.clone(),
            poll.user.clone(),
        ) {
            let stored = WorkbenchStored {
                host: host.clone(),
                session_token: token,
                active_project_id: project_id,
                user,
                projects: poll.projects.clone().unwrap_or_default(),
            };
            persist_stored(&stored)?;
            if let Ok(mut map) = pending_hosts().lock() {
                map.remove(&device_code);
            }
        }
    }

    Ok(DeviceAuthPollResult {
        status: poll.status,
        user: poll.user,
        active_project_id: poll.active_project_id,
        projects: poll.projects,
    })
}

pub fn workbench_get_session_core() -> WorkbenchSession {
    match load_stored() {
        Some(stored) if !stored.session_token.is_empty() => session_from_stored(stored),
        _ => WorkbenchSession::signed_out(),
    }
}

pub async fn workbench_list_projects_core() -> Result<JsonValue, AppCommandError> {
    let Some(stored) = load_stored() else {
        return Ok(serde_json::json!({ "projects": [] }));
    };
    let url = format!("{}{API_PREFIX}/business/my-projects", stored.host);
    let resp = http_client()?
        .get(&url)
        .header(DESKTOP_SESSION_HEADER, stored.session_token.as_str())
        .send()
        .await
        .map_err(request_error)?;
    let value: JsonValue = parse_json(resp).await?;

    // Refresh the cached project list so the switcher stays current offline.
    if let Some(array) = value.get("projects").and_then(|p| p.as_array()) {
        if let Ok(projects) =
            serde_json::from_value::<Vec<WorkbenchProject>>(JsonValue::Array(array.clone()))
        {
            let mut updated = stored;
            updated.projects = projects;
            let _ = persist_stored(&updated);
        }
    }
    Ok(value)
}

pub fn workbench_set_active_project_core(
    project_id: String,
) -> Result<WorkbenchSession, AppCommandError> {
    let project_id = project_id.trim().to_string();
    if project_id.is_empty() {
        return Err(AppCommandError::invalid_input("projectId is required"));
    }
    let Some(mut stored) = load_stored() else {
        return Ok(WorkbenchSession::signed_out());
    };
    stored.active_project_id = project_id;
    persist_stored(&stored)?;
    Ok(session_from_stored(stored))
}

pub fn workbench_sign_out_core() -> Result<(), AppCommandError> {
    crate::keyring_store::delete_workbench_session()
        .map_err(|e| AppCommandError::task_execution_failed(e))
}
