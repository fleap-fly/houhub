use std::sync::Arc;

use axum::{extract::Extension, Json};
use serde::Deserialize;
use serde_json::Value as JsonValue;

use crate::app_error::AppCommandError;
use crate::app_state::AppState;
use crate::commands::workbench::{
    workbench_ai_create_session_core, workbench_ai_get_session_core,
    workbench_ai_list_assistants_core, workbench_ai_list_sessions_core,
    workbench_ai_send_message_stream_core, workbench_begin_device_auth_core,
    workbench_get_session_core, workbench_list_client_suites_core, workbench_list_projects_core,
    workbench_poll_device_auth_core, workbench_set_active_project_core, workbench_sign_out_core,
    workbench_space_complete_upload_core, workbench_space_create_folder_core,
    workbench_space_delete_file_core, workbench_space_download_url_core, workbench_space_list_core,
    workbench_space_presign_upload_core, workbench_space_usage_core, DeviceAuthPollResult,
    DeviceAuthStart, WorkbenchClientSuite, WorkbenchSession,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BeginInput {
    #[serde(default)]
    pub host: Option<String>,
}

pub async fn workbench_begin_device_auth(
    Json(input): Json<BeginInput>,
) -> Result<Json<DeviceAuthStart>, AppCommandError> {
    Ok(Json(workbench_begin_device_auth_core(input.host).await?))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PollInput {
    pub device_code: String,
}

pub async fn workbench_poll_device_auth(
    Json(input): Json<PollInput>,
) -> Result<Json<DeviceAuthPollResult>, AppCommandError> {
    Ok(Json(
        workbench_poll_device_auth_core(input.device_code).await?,
    ))
}

pub async fn workbench_get_session() -> Result<Json<WorkbenchSession>, AppCommandError> {
    Ok(Json(workbench_get_session_core()))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchClientSuitesInput {
    pub project_id: String,
}

pub async fn workbench_list_client_suites(
    Json(input): Json<WorkbenchClientSuitesInput>,
) -> Result<Json<Vec<WorkbenchClientSuite>>, AppCommandError> {
    Ok(Json(workbench_list_client_suites_core(input.project_id).await?))
}

pub async fn workbench_list_projects() -> Result<Json<JsonValue>, AppCommandError> {
    Ok(Json(workbench_list_projects_core().await?))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetProjectInput {
    pub project_id: String,
}

pub async fn workbench_set_active_project(
    Json(input): Json<SetProjectInput>,
) -> Result<Json<WorkbenchSession>, AppCommandError> {
    Ok(Json(workbench_set_active_project_core(input.project_id)?))
}

pub async fn workbench_sign_out() -> Result<Json<JsonValue>, AppCommandError> {
    workbench_sign_out_core()?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Project-space (digital asset center) handlers ──

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceListInput {
    pub project_id: String,
    #[serde(default)]
    pub folder_path: Option<String>,
    #[serde(default)]
    pub search: Option<String>,
}

pub async fn workbench_space_list(
    Json(input): Json<SpaceListInput>,
) -> Result<Json<JsonValue>, AppCommandError> {
    Ok(Json(
        workbench_space_list_core(input.project_id, input.folder_path, input.search).await?,
    ))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceUsageInput {
    pub project_id: String,
}

pub async fn workbench_space_usage(
    Json(input): Json<SpaceUsageInput>,
) -> Result<Json<JsonValue>, AppCommandError> {
    Ok(Json(workbench_space_usage_core(input.project_id).await?))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceDownloadUrlInput {
    pub project_id: String,
    pub file_id: String,
    #[serde(default)]
    pub disposition: Option<String>,
}

pub async fn workbench_space_download_url(
    Json(input): Json<SpaceDownloadUrlInput>,
) -> Result<Json<JsonValue>, AppCommandError> {
    Ok(Json(
        workbench_space_download_url_core(input.project_id, input.file_id, input.disposition)
            .await?,
    ))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceCreateFolderInput {
    pub project_id: String,
    pub folder_name: String,
    #[serde(default)]
    pub parent_id: Option<String>,
}

pub async fn workbench_space_create_folder(
    Json(input): Json<SpaceCreateFolderInput>,
) -> Result<Json<JsonValue>, AppCommandError> {
    Ok(Json(
        workbench_space_create_folder_core(input.project_id, input.folder_name, input.parent_id)
            .await?,
    ))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpacePresignUploadInput {
    pub project_id: String,
    pub file_name: String,
    #[serde(default)]
    pub mime_type: Option<String>,
    pub size: i64,
    #[serde(default)]
    pub folder_path: Option<String>,
}

pub async fn workbench_space_presign_upload(
    Json(input): Json<SpacePresignUploadInput>,
) -> Result<Json<JsonValue>, AppCommandError> {
    Ok(Json(
        workbench_space_presign_upload_core(
            input.project_id,
            input.file_name,
            input.mime_type,
            input.size,
            input.folder_path,
        )
        .await?,
    ))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceCompleteUploadInput {
    pub project_id: String,
    pub file_id: String,
    #[serde(default)]
    pub mime_type: Option<String>,
    #[serde(default)]
    pub folder_path: Option<String>,
}

pub async fn workbench_space_complete_upload(
    Json(input): Json<SpaceCompleteUploadInput>,
) -> Result<Json<JsonValue>, AppCommandError> {
    Ok(Json(
        workbench_space_complete_upload_core(
            input.project_id,
            input.file_id,
            input.mime_type,
            input.folder_path,
        )
        .await?,
    ))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceDeleteFileInput {
    pub project_id: String,
    pub file_id: String,
}

pub async fn workbench_space_delete_file(
    Json(input): Json<SpaceDeleteFileInput>,
) -> Result<Json<JsonValue>, AppCommandError> {
    Ok(Json(
        workbench_space_delete_file_core(input.project_id, input.file_id).await?,
    ))
}

// ── Project assistant handlers ──

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProjectInput {
    pub project_id: String,
}

pub async fn workbench_ai_list_assistants(
    Json(input): Json<AiProjectInput>,
) -> Result<Json<JsonValue>, AppCommandError> {
    Ok(Json(
        workbench_ai_list_assistants_core(input.project_id).await?,
    ))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiListSessionsInput {
    pub project_id: String,
    #[serde(default)]
    pub assistant_id: Option<String>,
    #[serde(default)]
    pub limit: Option<i64>,
}

pub async fn workbench_ai_list_sessions(
    Json(input): Json<AiListSessionsInput>,
) -> Result<Json<JsonValue>, AppCommandError> {
    Ok(Json(
        workbench_ai_list_sessions_core(input.project_id, input.assistant_id, input.limit).await?,
    ))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCreateSessionInput {
    pub project_id: String,
    #[serde(default)]
    pub assistant_id: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
}

pub async fn workbench_ai_create_session(
    Json(input): Json<AiCreateSessionInput>,
) -> Result<Json<JsonValue>, AppCommandError> {
    Ok(Json(
        workbench_ai_create_session_core(input.project_id, input.assistant_id, input.title).await?,
    ))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSessionInput {
    pub project_id: String,
    pub session_id: String,
}

pub async fn workbench_ai_get_session(
    Json(input): Json<AiSessionInput>,
) -> Result<Json<JsonValue>, AppCommandError> {
    Ok(Json(
        workbench_ai_get_session_core(input.project_id, input.session_id).await?,
    ))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSendMessageInput {
    pub project_id: String,
    pub assistant_id: String,
    pub session_id: String,
    pub query: String,
    #[serde(default)]
    pub request_id: Option<String>,
}

pub async fn workbench_ai_send_message(
    Extension(state): Extension<Arc<AppState>>,
    Json(input): Json<AiSendMessageInput>,
) -> Result<Json<JsonValue>, AppCommandError> {
    Ok(Json(
        workbench_ai_send_message_stream_core(
            input.project_id,
            input.assistant_id,
            input.session_id,
            input.query,
            input.request_id.unwrap_or_default(),
            state.emitter.clone(),
        )
        .await?,
    ))
}
