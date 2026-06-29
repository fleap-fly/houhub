//! Project System (PS) "workbench" integration for houhub.
//!
//! PS is an independent identity system. This module performs the device-code
//! handshake against PS, persists the resulting PS session token in the OS
//! keyring (desktop) or the server token file, and proxies PS project-space
//! calls so the webview never holds the secret nor makes cross-origin requests.
//!
//! Submodules:
//! - [`types`]  serializable surfaces shared across the layer
//! - [`client`] HTTP plumbing + auth/project headers
//! - [`store`]  keyring persistence of the session blob
//! - [`auth`]   device-code handshake, session, project listing, sign-out
//! - [`space`]  portal-neutral project-space (digital asset center) data layer

mod auth;
mod ai;
mod client;
mod space;
mod store;
mod types;

pub use ai::{
    workbench_ai_create_session_core, workbench_ai_get_session_core,
    workbench_ai_list_assistants_core, workbench_ai_list_sessions_core,
    workbench_ai_send_message_core,
};
pub use auth::{
    workbench_begin_device_auth_core, workbench_get_session_core, workbench_list_projects_core,
    workbench_poll_device_auth_core, workbench_set_active_project_core, workbench_sign_out_core,
};
pub use space::{
    workbench_space_complete_upload_core, workbench_space_create_folder_core,
    workbench_space_delete_file_core, workbench_space_download_url_core, workbench_space_list_core,
    workbench_space_presign_upload_core, workbench_space_usage_core,
};
pub use types::{DeviceAuthPollResult, DeviceAuthStart, WorkbenchSession};

#[cfg(feature = "tauri-runtime")]
use crate::app_error::AppCommandError;
#[cfg(feature = "tauri-runtime")]
use serde_json::Value as JsonValue;

// ── Tauri command wrappers ──────────────────────────────────────────────────

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn workbench_begin_device_auth(
    host: Option<String>,
) -> Result<DeviceAuthStart, AppCommandError> {
    workbench_begin_device_auth_core(host).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn workbench_poll_device_auth(
    device_code: String,
) -> Result<DeviceAuthPollResult, AppCommandError> {
    workbench_poll_device_auth_core(device_code).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn workbench_get_session() -> Result<WorkbenchSession, AppCommandError> {
    Ok(workbench_get_session_core())
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn workbench_list_projects() -> Result<JsonValue, AppCommandError> {
    workbench_list_projects_core().await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn workbench_set_active_project(
    project_id: String,
) -> Result<WorkbenchSession, AppCommandError> {
    workbench_set_active_project_core(project_id)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn workbench_sign_out() -> Result<(), AppCommandError> {
    workbench_sign_out_core()
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn workbench_space_list(
    project_id: String,
    folder_path: Option<String>,
    search: Option<String>,
) -> Result<JsonValue, AppCommandError> {
    workbench_space_list_core(project_id, folder_path, search).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn workbench_space_usage(project_id: String) -> Result<JsonValue, AppCommandError> {
    workbench_space_usage_core(project_id).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn workbench_space_download_url(
    project_id: String,
    file_id: String,
    disposition: Option<String>,
) -> Result<JsonValue, AppCommandError> {
    workbench_space_download_url_core(project_id, file_id, disposition).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn workbench_space_create_folder(
    project_id: String,
    folder_name: String,
    parent_id: Option<String>,
) -> Result<JsonValue, AppCommandError> {
    workbench_space_create_folder_core(project_id, folder_name, parent_id).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn workbench_space_presign_upload(
    project_id: String,
    file_name: String,
    mime_type: Option<String>,
    size: i64,
    folder_path: Option<String>,
) -> Result<JsonValue, AppCommandError> {
    workbench_space_presign_upload_core(project_id, file_name, mime_type, size, folder_path).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn workbench_space_complete_upload(
    project_id: String,
    file_id: String,
    mime_type: Option<String>,
    folder_path: Option<String>,
) -> Result<JsonValue, AppCommandError> {
    workbench_space_complete_upload_core(project_id, file_id, mime_type, folder_path).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn workbench_space_delete_file(
    project_id: String,
    file_id: String,
) -> Result<JsonValue, AppCommandError> {
    workbench_space_delete_file_core(project_id, file_id).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn workbench_ai_list_assistants(
    project_id: String,
) -> Result<JsonValue, AppCommandError> {
    workbench_ai_list_assistants_core(project_id).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn workbench_ai_list_sessions(
    project_id: String,
    assistant_id: Option<String>,
    limit: Option<i64>,
) -> Result<JsonValue, AppCommandError> {
    workbench_ai_list_sessions_core(project_id, assistant_id, limit).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn workbench_ai_create_session(
    project_id: String,
    assistant_id: Option<String>,
    title: Option<String>,
) -> Result<JsonValue, AppCommandError> {
    workbench_ai_create_session_core(project_id, assistant_id, title).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn workbench_ai_get_session(
    project_id: String,
    session_id: String,
) -> Result<JsonValue, AppCommandError> {
    workbench_ai_get_session_core(project_id, session_id).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn workbench_ai_send_message(
    project_id: String,
    assistant_id: String,
    session_id: String,
    query: String,
) -> Result<JsonValue, AppCommandError> {
    workbench_ai_send_message_core(project_id, assistant_id, session_id, query).await
}
