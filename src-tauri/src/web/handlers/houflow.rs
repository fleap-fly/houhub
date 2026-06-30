use std::sync::Arc;

use axum::{extract::Extension, Json};
use serde::Deserialize;

use crate::app_error::AppCommandError;
use crate::app_state::AppState;
use crate::commands::houflow::{
    houflow_connector_autostart_core, houflow_connector_commands_core,
    houflow_connector_down_core, houflow_connector_heartbeat_core, houflow_connector_login_core,
    houflow_connector_logs_core, houflow_connector_status_core,
    houflow_connector_sync_local_agents_core, houflow_connector_up_core,
    houflow_control_http_call, houflow_sync_managed_gateway_core,
    HouflowConnectorAutostartInput, HouflowConnectorCommandsInput, HouflowConnectorLogsInput,
    HouflowConnectorLoginInput, HouflowConnectorStatusResult,
    HouflowConnectorSyncLocalAgentsInput, HouflowConnectorSyncLocalAgentsResult,
    HouflowControlHttpRequest, HouflowControlHttpResponse, HouflowManagedGatewaySyncInput,
    HouflowManagedGatewaySyncResult,
};
use serde_json::Value as JsonValue;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HouflowControlHttpCallInput {
    request: HouflowControlHttpRequest,
}

pub async fn houflow_sync_managed_gateway(
    Extension(state): Extension<Arc<AppState>>,
    Json(input): Json<HouflowManagedGatewaySyncInput>,
) -> Result<Json<HouflowManagedGatewaySyncResult>, AppCommandError> {
    let result = houflow_sync_managed_gateway_core(
        &state.db,
        &state.connection_manager,
        &state.data_dir,
        &state.emitter,
        input,
    )
    .await?;
    Ok(Json(result))
}

pub async fn houflow_control_http_call_web(
    Json(input): Json<HouflowControlHttpCallInput>,
) -> Result<Json<HouflowControlHttpResponse>, AppCommandError> {
    Ok(Json(houflow_control_http_call(input.request).await?))
}

pub async fn houflow_connector_status() -> Result<Json<HouflowConnectorStatusResult>, AppCommandError> {
    Ok(Json(houflow_connector_status_core().await))
}

pub async fn houflow_connector_login(
    Json(input): Json<HouflowConnectorLoginInput>,
) -> Result<Json<JsonValue>, AppCommandError> {
    Ok(Json(houflow_connector_login_core(input).await?))
}

pub async fn houflow_connector_up() -> Result<Json<JsonValue>, AppCommandError> {
    Ok(Json(houflow_connector_up_core().await?))
}

pub async fn houflow_connector_down() -> Result<Json<JsonValue>, AppCommandError> {
    Ok(Json(houflow_connector_down_core().await?))
}

pub async fn houflow_connector_heartbeat() -> Result<Json<JsonValue>, AppCommandError> {
    Ok(Json(houflow_connector_heartbeat_core().await?))
}

pub async fn houflow_connector_autostart(
    Json(input): Json<HouflowConnectorAutostartInput>,
) -> Result<Json<JsonValue>, AppCommandError> {
    Ok(Json(houflow_connector_autostart_core(input).await?))
}

pub async fn houflow_connector_logs(
    Json(input): Json<HouflowConnectorLogsInput>,
) -> Result<Json<JsonValue>, AppCommandError> {
    Ok(Json(houflow_connector_logs_core(input).await?))
}

pub async fn houflow_connector_commands(
    Json(input): Json<HouflowConnectorCommandsInput>,
) -> Result<Json<JsonValue>, AppCommandError> {
    Ok(Json(houflow_connector_commands_core(input).await?))
}

pub async fn houflow_connector_sync_local_agents(
    Json(input): Json<HouflowConnectorSyncLocalAgentsInput>,
) -> Result<Json<HouflowConnectorSyncLocalAgentsResult>, AppCommandError> {
    Ok(Json(houflow_connector_sync_local_agents_core(input).await?))
}
