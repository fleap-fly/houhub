use std::collections::BTreeMap;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

#[cfg(feature = "tauri-runtime")]
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
#[cfg(feature = "tauri-runtime")]
use tokio::net::TcpListener;

use crate::acp::manager::ConnectionManager;
use crate::acp::registry;
use crate::app_error::AppCommandError;
use crate::commands::{acp, model_provider as model_provider_commands};
use crate::db::service::{agent_setting_service, model_provider_service};
use crate::db::AppDatabase;
use crate::models::agent::AgentType;
use crate::models::model_provider::ModelProviderInfo;
use crate::web::event_bridge::EventEmitter;

const CONNECTOR_COMMAND_TIMEOUT: Duration = Duration::from_secs(20);
const CONTROL_HTTP_TIMEOUT: Duration = Duration::from_secs(60);
#[cfg(feature = "tauri-runtime")]
const OAUTH_LOOPBACK_CALLBACK_PATH: &str = "/houflow/oauth-callback";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HouflowAuthSecret {
    pub control_api_key: Option<String>,
    pub gateway_api_key: Option<String>,
    pub gateway_api_key_purpose: Option<String>,
    pub csrf_token: Option<String>,
    pub session_cookie: Option<String>,
    pub houflow_session_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HouflowControlHttpRequest {
    pub base_url: String,
    pub url: String,
    pub method: String,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HouflowControlHttpResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: BTreeMap<String, String>,
    pub body: Vec<u8>,
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn houflow_load_auth_secret() -> Result<Option<HouflowAuthSecret>, String> {
    let Some(raw) = crate::keyring_store::get_houflow_auth_secret() else {
        return Ok(None);
    };
    serde_json::from_str(&raw)
        .map(Some)
        .map_err(|e| format!("failed to parse Houflow auth secret from secure storage: {e}"))
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn houflow_save_auth_secret(secret: HouflowAuthSecret) -> Result<(), String> {
    let secret = normalize_secret(secret);
    if secret.control_api_key.is_none()
        && secret.gateway_api_key.is_none()
        && secret.csrf_token.is_none()
        && secret.session_cookie.is_none()
        && secret.houflow_session_token.is_none()
    {
        return crate::keyring_store::delete_houflow_auth_secret();
    }
    let raw = serde_json::to_string(&secret)
        .map_err(|e| format!("failed to serialize Houflow auth secret: {e}"))?;
    crate::keyring_store::set_houflow_auth_secret(&raw)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn houflow_clear_auth_secret() -> Result<(), String> {
    crate::keyring_store::delete_houflow_auth_secret()
}

#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn houflow_control_http_call(
    request: HouflowControlHttpRequest,
) -> Result<HouflowControlHttpResponse, AppCommandError> {
    let base_url = reqwest::Url::parse(request.base_url.trim())
        .map_err(|e| AppCommandError::invalid_input(format!("Invalid Houflow base URL: {e}")))?;
    let url = reqwest::Url::parse(request.url.trim())
        .map_err(|e| AppCommandError::invalid_input(format!("Invalid Houflow request URL: {e}")))?;
    validate_houflow_control_url(&base_url, &url)?;

    let method = request
        .method
        .parse::<reqwest::Method>()
        .map_err(|e| AppCommandError::invalid_input(format!("Invalid HTTP method: {e}")))?;
    if !matches!(
        method,
        reqwest::Method::GET
            | reqwest::Method::POST
            | reqwest::Method::PUT
            | reqwest::Method::PATCH
            | reqwest::Method::DELETE
    ) {
        return Err(AppCommandError::invalid_input(
            "HTTP method is not allowed for Houflow control requests",
        ));
    }

    let client = reqwest::Client::builder()
        .timeout(CONTROL_HTTP_TIMEOUT)
        .build()
        .map_err(|e| {
            AppCommandError::network("Failed to create Houflow HTTP client")
                .with_detail(e.to_string())
        })?;
    let mut builder = client.request(method, url);
    for (key, value) in request.headers {
        if !is_allowed_houflow_control_header(&key) {
            continue;
        }
        let name = reqwest::header::HeaderName::from_bytes(key.as_bytes())
            .map_err(|e| AppCommandError::invalid_input(format!("Invalid HTTP header: {e}")))?;
        let value = reqwest::header::HeaderValue::from_str(&value).map_err(|e| {
            AppCommandError::invalid_input(format!("Invalid HTTP header value: {e}"))
        })?;
        builder = builder.header(name, value);
    }
    if let Some(body) = request.body {
        builder = builder.body(body);
    }

    let response = builder.send().await.map_err(|e| {
        AppCommandError::network("Houflow control request failed").with_detail(e.to_string())
    })?;
    let status = response.status();
    let mut headers = BTreeMap::new();
    for (name, value) in response.headers() {
        if is_exposed_houflow_control_header(name.as_str()) {
            headers.insert(
                name.as_str().to_string(),
                value.to_str().unwrap_or_default().to_string(),
            );
        }
    }
    let body = response.bytes().await.map_err(|e| {
        AppCommandError::network("Failed to read Houflow control response")
            .with_detail(e.to_string())
    })?;

    Ok(HouflowControlHttpResponse {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_string(),
        headers,
        body: body.to_vec(),
    })
}

fn validate_houflow_control_url(
    base_url: &reqwest::Url,
    url: &reqwest::Url,
) -> Result<(), AppCommandError> {
    if base_url.scheme() != url.scheme()
        || base_url.host_str() != url.host_str()
        || base_url.port_or_known_default() != url.port_or_known_default()
    {
        return Err(AppCommandError::invalid_input(
            "Houflow request URL must match the signed-in control origin",
        ));
    }
    let Some(host) = url.host_str() else {
        return Err(AppCommandError::invalid_input("Houflow request URL is missing a host"));
    };
    let local_dev_host = matches!(host, "localhost" | "127.0.0.1" | "::1");
    if !(host == "houflow.com" || host.ends_with(".houflow.com") || local_dev_host) {
        return Err(AppCommandError::invalid_input(
            "Houflow request host is not allowed",
        ));
    }
    if url.path() != "/v1" && !url.path().starts_with("/v1/") {
        return Err(AppCommandError::invalid_input(
            "Houflow control requests must target /v1 endpoints",
        ));
    }
    Ok(())
}

fn is_allowed_houflow_control_header(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "accept"
            | "content-type"
            | "x-api-key"
            | "cookie"
            | "x-csrf-token"
            | "x-agent-hub-workspace-id"
            | "x-actor-type"
            | "x-actor-id"
    )
}

fn is_exposed_houflow_control_header(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "content-type" | "content-length" | "content-disposition"
    )
}

/// Start a one-shot HTTP server on `127.0.0.1` (random port) to receive the
/// OAuth redirect callback from the browser. Returns the port immediately.
/// The server waits for a request matching `/houflow/oauth-callback`, responds
/// with a success HTML page, emits the `houflow://oauth-callback` Tauri event
/// with the full redirect URL, then shuts down. Unrelated loopback probes are
/// answered with 404 and ignored. Times out after 10 minutes.
#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn houflow_oauth_loopback_listen(app: tauri::AppHandle) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("failed to bind OAuth loopback listener: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("failed to get local address: {e}"))?
        .port();

    tauri::async_runtime::spawn(async move {
        let timeout = tokio::time::sleep(Duration::from_secs(600));
        tokio::pin!(timeout);

        loop {
            tokio::select! {
                result = listener.accept() => {
                    match result {
                        Ok((stream, _)) => {
                            if handle_oauth_loopback_connection(stream, &app).await {
                                break;
                            }
                        }
                        Err(e) => {
                            eprintln!("[OAuth] loopback listener failed on port {port}: {e}");
                            break;
                        }
                    }
                }
                _ = &mut timeout => {
                    eprintln!("[OAuth] loopback listener timed out on port {port}");
                    break;
                }
            }
        }
    });

    Ok(port)
}

#[cfg(feature = "tauri-runtime")]
async fn handle_oauth_loopback_connection(
    stream: tokio::net::TcpStream,
    app: &tauri::AppHandle,
) -> bool {
    use tauri::Emitter;

    let (reader, mut writer) = stream.into_split();
    let mut buf_reader = BufReader::new(reader);
    let mut request_line = String::new();
    if buf_reader.read_line(&mut request_line).await.is_err() {
        return false;
    }

    // Parse: "GET /houflow/oauth-callback?status=approved&device_code=xxx HTTP/1.1\r\n"
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts.next().unwrap_or("");
    let path = request_parts.next().unwrap_or("").to_string();

    // Drain remaining headers (read until empty line)
    let mut header_line = String::new();
    loop {
        header_line.clear();
        match buf_reader.read_line(&mut header_line).await {
            Ok(0) | Err(_) => break,
            Ok(_) => {
                if header_line.trim().is_empty() {
                    break;
                }
            }
        }
    }

    let Some(query) = oauth_loopback_query(&path) else {
        let response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        let _ = writer.write_all(response.as_bytes()).await;
        let _ = writer.shutdown().await;
        return false;
    };

    if method != "GET" {
        let response = "HTTP/1.1 405 Method Not Allowed\r\nAllow: GET\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        let _ = writer.write_all(response.as_bytes()).await;
        let _ = writer.shutdown().await;
        return false;
    }

    // Respond with a self-closing HTML page
    let html = r#"<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>HouHub</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fafafa}
.card{text-align:center;padding:2rem;border-radius:12px;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.08)}
h1{font-size:1.4rem;margin:0 0 .5rem}p{color:#666;margin:0}</style></head>
<body><div class="card"><h1>&#10003; Authorization Complete</h1><p>You can close this tab and return to HouHub.</p></div>
<script>setTimeout(()=>window.close(),1500)</script></body></html>"#;

    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        html.len(),
        html
    );
    let _ = writer.write_all(response.as_bytes()).await;
    let _ = writer.shutdown().await;

    // Reconstruct the full deep-link-equivalent URL from the path query params.
    let url = format!("hou-agent-hub://oauth{query}");
    let _ = app.emit(
        "houflow://oauth-callback",
        serde_json::json!({ "url": url }),
    );
    true
}

#[cfg(feature = "tauri-runtime")]
fn oauth_loopback_query(path: &str) -> Option<&str> {
    let suffix = path.strip_prefix(OAUTH_LOOPBACK_CALLBACK_PATH)?;
    if suffix.starts_with('?') {
        return Some(suffix);
    }
    None
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HouflowManagedGatewaySyncInput {
    pub provider_name: Option<String>,
    pub provider_type: Option<String>,
    pub api_url: String,
    pub api_key: String,
    pub default_model: Option<String>,
    #[serde(default)]
    pub models: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HouflowManagedGatewaySyncResult {
    pub providers: Vec<ModelProviderInfo>,
    pub bound_agent_types: Vec<AgentType>,
    pub skipped_agent_types: Vec<AgentType>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HouflowConnectorStatusResult {
    pub installed: bool,
    pub executable: Option<String>,
    pub version: Option<JsonValue>,
    pub snapshot: Option<JsonValue>,
    pub diagnosis: Option<JsonValue>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HouflowConnectorLoginInput {
    pub control_url: Option<String>,
    pub console_url: Option<String>,
    pub name: Option<String>,
    pub no_open: Option<bool>,
    pub timeout_seconds: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HouflowConnectorLocalAgentInput {
    pub local_agent_ref: String,
    pub provider: String,
    pub name: String,
    pub runtime_provider: Option<String>,
    pub runtime_runner: Option<bool>,
    pub working_directory: Option<String>,
    pub skills_directory: Option<String>,
    pub use_default_skills_directory: Option<bool>,
    pub capabilities: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HouflowConnectorSyncLocalAgentsInput {
    pub agents: Vec<HouflowConnectorLocalAgentInput>,
    pub heartbeat: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HouflowConnectorSyncLocalAgentsResult {
    pub agents: Vec<JsonValue>,
    pub heartbeat: Option<JsonValue>,
    pub status: JsonValue,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HouflowConnectorAutostartInput {
    pub enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HouflowConnectorLogsInput {
    pub lines: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HouflowConnectorCommandsInput {
    pub limit: Option<u64>,
}

#[derive(Debug, Clone)]
struct ConnectorCli {
    program: OsString,
    base_args: Vec<OsString>,
    display: String,
}

pub async fn houflow_sync_managed_gateway_core(
    db: &AppDatabase,
    manager: &ConnectionManager,
    data_dir: &Path,
    emitter: &EventEmitter,
    input: HouflowManagedGatewaySyncInput,
) -> Result<HouflowManagedGatewaySyncResult, AppCommandError> {
    let api_url = required_trimmed(input.api_url, "apiUrl")?;
    let api_key = required_trimmed(input.api_key, "apiKey")?;
    let provider_name =
        trim_optional(input.provider_name).unwrap_or_else(|| "Houflow Gateway".to_string());
    let default_model = trim_optional(input.default_model);
    let models = normalize_model_list(input.models);
    if models.is_empty() && default_model.is_none() {
        return Err(AppCommandError::invalid_input(
            "Houflow gateway returned no models",
        ));
    }
    let agent_types = gateway_agent_types();

    let defaults = agent_types
        .iter()
        .enumerate()
        .map(
            |(idx, agent_type)| agent_setting_service::AgentDefaultInput {
                agent_type: *agent_type,
                registry_id: registry::registry_id_for(*agent_type).to_string(),
                default_sort_order: idx as i32,
            },
        )
        .collect::<Vec<_>>();
    agent_setting_service::ensure_defaults(&db.conn, &defaults)
        .await
        .map_err(AppCommandError::from)?;

    let agent_type_ids = agent_types
        .iter()
        .map(|agent_type| agent_type_id(*agent_type))
        .collect::<Result<Vec<_>, _>>()?;
    let existing = find_houflow_provider(db, &provider_name).await?;
    let model = synced_gateway_model(existing.as_ref(), default_model, &models)?;
    let provider = match existing {
        Some(existing) => {
            let provider = model_provider_commands::update_model_provider_and_refresh(
                db,
                manager,
                data_dir,
                existing.id,
                Some(provider_name.clone()),
                Some(api_url.clone()),
                Some(api_key.clone()),
                None,
                None,
                Some(model.clone().unwrap_or_default()),
                Some(models.clone()),
                emitter,
            )
            .await?
            .provider;
            let provider = model_provider_service::update_agent_types(
                &db.conn,
                provider.id,
                agent_type_ids.clone(),
            )
            .await
            .map_err(AppCommandError::from)?;
            ModelProviderInfo::from(provider)
        }
        None => {
            model_provider_commands::create_model_provider_with_agent_types_core(
                db,
                provider_name.clone(),
                api_url.clone(),
                api_key.clone(),
                agent_type_ids,
                model.clone(),
                Some(models.clone()),
            )
            .await?
        }
    };

    let mut bound_agent_types = Vec::new();
    let skipped_agent_types = Vec::new();

    for agent_type in agent_types {
        let setting = agent_setting_service::get_by_agent_type(&db.conn, agent_type)
            .await
            .map_err(AppCommandError::from)?;
        let env = setting
            .as_ref()
            .and_then(|row| row.env_json.as_deref())
            .and_then(|raw| serde_json::from_str::<BTreeMap<String, String>>(raw).ok())
            .unwrap_or_default();
        acp::acp_update_agent_env_preserving_enabled_and_refresh(
            agent_type,
            env,
            Some(provider.id),
            db,
            manager,
            data_dir,
            emitter,
        )
        .await
        .map_err(|e| AppCommandError::task_execution_failed(e.to_string()))?;
        bound_agent_types.push(agent_type);
    }

    Ok(HouflowManagedGatewaySyncResult {
        providers: vec![provider],
        bound_agent_types,
        skipped_agent_types,
    })
}

pub async fn houflow_connector_status_core() -> HouflowConnectorStatusResult {
    let Some(cli) = resolve_connector_cli() else {
        return HouflowConnectorStatusResult {
            installed: false,
            executable: None,
            version: None,
            snapshot: None,
            diagnosis: None,
            error: Some(
                "hou-agent-connector was not found on PATH or in the local workspace".to_string(),
            ),
        };
    };

    let version = run_connector_json_with_cli(&cli, ["version"]).await;
    let snapshot = run_connector_json_with_cli(&cli, ["status"]).await;
    let diagnosis = run_connector_json_with_cli(&cli, ["diagnose"]).await;
    let error = [
        version.as_ref().err(),
        snapshot.as_ref().err(),
        diagnosis.as_ref().err(),
    ]
    .into_iter()
    .flatten()
    .map(|err| err.to_string())
    .next();

    HouflowConnectorStatusResult {
        installed: true,
        executable: Some(cli.display),
        version: version.ok(),
        snapshot: snapshot.ok(),
        diagnosis: diagnosis.ok(),
        error,
    }
}

pub async fn houflow_connector_login_core(
    input: HouflowConnectorLoginInput,
) -> Result<JsonValue, AppCommandError> {
    let control_url =
        trim_optional(input.control_url).unwrap_or_else(|| "https://agent.houflow.com".to_string());
    let console_url = trim_optional(input.console_url).unwrap_or_else(|| control_url.clone());
    let name = trim_optional(input.name).unwrap_or_else(|| "HouHub".to_string());
    let timeout = input.timeout_seconds.unwrap_or(300).clamp(30, 900);
    let mut args = vec![
        "login".to_string(),
        "--control-url".to_string(),
        control_url,
        "--console-url".to_string(),
        console_url,
        "--name".to_string(),
        name,
        "--timeout".to_string(),
        timeout.to_string(),
    ];
    if input.no_open.unwrap_or(false) {
        args.push("--no-open".to_string());
    }
    run_connector_json(args).await
}

pub async fn houflow_connector_up_core() -> Result<JsonValue, AppCommandError> {
    run_connector_json(["up"]).await
}

pub async fn houflow_connector_down_core() -> Result<JsonValue, AppCommandError> {
    run_connector_json(["down"]).await
}

pub async fn houflow_connector_heartbeat_core() -> Result<JsonValue, AppCommandError> {
    run_connector_json(["heartbeat"]).await
}

pub async fn houflow_connector_autostart_core(
    input: HouflowConnectorAutostartInput,
) -> Result<JsonValue, AppCommandError> {
    if input.enabled {
        run_connector_json(["autostart", "enable"]).await
    } else {
        run_connector_json(["autostart", "disable"]).await
    }
}

pub async fn houflow_connector_logs_core(
    input: HouflowConnectorLogsInput,
) -> Result<JsonValue, AppCommandError> {
    let lines = input.lines.unwrap_or(80).clamp(10, 500);
    run_connector_json(["logs".to_string(), "--lines".to_string(), lines.to_string()]).await
}

pub async fn houflow_connector_commands_core(
    input: HouflowConnectorCommandsInput,
) -> Result<JsonValue, AppCommandError> {
    let limit = input.limit.unwrap_or(20).clamp(1, 100);
    run_connector_json([
        "commands".to_string(),
        "list".to_string(),
        "--limit".to_string(),
        limit.to_string(),
    ])
    .await
}

pub async fn houflow_connector_sync_local_agents_core(
    input: HouflowConnectorSyncLocalAgentsInput,
) -> Result<HouflowConnectorSyncLocalAgentsResult, AppCommandError> {
    if input.agents.is_empty() {
        return Err(AppCommandError::invalid_input(
            "at least one local agent is required",
        ));
    }

    let mut synced_agents = Vec::with_capacity(input.agents.len());
    for agent in input.agents {
        let mut args = vec![
            "local-agent".to_string(),
            "add".to_string(),
            "--ref".to_string(),
            required_trimmed(agent.local_agent_ref, "localAgentRef")?,
            "--provider".to_string(),
            required_trimmed(agent.provider.clone(), "provider")?,
            "--name".to_string(),
            required_trimmed(agent.name, "name")?,
        ];
        if let Some(runtime_provider) = trim_optional(agent.runtime_provider) {
            args.push("--runtime-provider".to_string());
            args.push(runtime_provider);
        }
        if agent.runtime_runner.unwrap_or(false) {
            args.push("--runtime-runner".to_string());
        }
        if let Some(working_directory) = trim_optional(agent.working_directory) {
            args.push("--cwd".to_string());
            args.push(working_directory);
        }
        let skills_directory = trim_optional(agent.skills_directory).or_else(|| {
            agent
                .use_default_skills_directory
                .unwrap_or(true)
                .then(|| default_skills_directory(&agent.provider))
                .flatten()
        });
        if let Some(skills_directory) = skills_directory {
            args.push("--skills-dir".to_string());
            args.push(skills_directory);
        }
        let capabilities = agent
            .capabilities
            .unwrap_or_default()
            .into_iter()
            .map(|item| item.trim().to_string())
            .filter(|item| !item.is_empty())
            .collect::<Vec<_>>();
        if !capabilities.is_empty() {
            args.push("--capabilities".to_string());
            args.push(capabilities.join(","));
        }
        synced_agents.push(run_connector_json(args).await?);
    }

    let heartbeat = if input.heartbeat.unwrap_or(true) {
        Some(houflow_connector_heartbeat_core().await?)
    } else {
        None
    };
    let status = run_connector_json(["status"]).await?;
    Ok(HouflowConnectorSyncLocalAgentsResult {
        agents: synced_agents,
        heartbeat,
        status,
    })
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn houflow_sync_managed_gateway(
    db: tauri::State<'_, AppDatabase>,
    manager: tauri::State<'_, ConnectionManager>,
    app: tauri::AppHandle,
    provider_name: Option<String>,
    provider_type: Option<String>,
    api_url: String,
    api_key: String,
    default_model: Option<String>,
    models: Vec<String>,
) -> Result<HouflowManagedGatewaySyncResult, AppCommandError> {
    use tauri::Manager;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map(|p| crate::paths::resolve_effective_data_dir(&p))
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    let emitter = EventEmitter::Tauri(app);
    let input = HouflowManagedGatewaySyncInput {
        provider_name,
        provider_type,
        api_url,
        api_key,
        default_model,
        models,
    };
    houflow_sync_managed_gateway_core(&db, &manager, &app_data_dir, &emitter, input).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn houflow_connector_status() -> Result<HouflowConnectorStatusResult, AppCommandError> {
    Ok(houflow_connector_status_core().await)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn houflow_connector_login(
    input: HouflowConnectorLoginInput,
) -> Result<JsonValue, AppCommandError> {
    houflow_connector_login_core(input).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn houflow_connector_up() -> Result<JsonValue, AppCommandError> {
    houflow_connector_up_core().await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn houflow_connector_down() -> Result<JsonValue, AppCommandError> {
    houflow_connector_down_core().await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn houflow_connector_heartbeat() -> Result<JsonValue, AppCommandError> {
    houflow_connector_heartbeat_core().await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn houflow_connector_autostart(
    input: HouflowConnectorAutostartInput,
) -> Result<JsonValue, AppCommandError> {
    houflow_connector_autostart_core(input).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn houflow_connector_logs(
    input: HouflowConnectorLogsInput,
) -> Result<JsonValue, AppCommandError> {
    houflow_connector_logs_core(input).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn houflow_connector_commands(
    input: HouflowConnectorCommandsInput,
) -> Result<JsonValue, AppCommandError> {
    houflow_connector_commands_core(input).await
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub async fn houflow_connector_sync_local_agents(
    input: HouflowConnectorSyncLocalAgentsInput,
) -> Result<HouflowConnectorSyncLocalAgentsResult, AppCommandError> {
    houflow_connector_sync_local_agents_core(input).await
}

#[cfg(feature = "tauri-runtime")]
fn normalize_secret(secret: HouflowAuthSecret) -> HouflowAuthSecret {
    HouflowAuthSecret {
        control_api_key: non_empty(secret.control_api_key),
        gateway_api_key: non_empty(secret.gateway_api_key),
        gateway_api_key_purpose: non_empty(secret.gateway_api_key_purpose),
        csrf_token: non_empty(secret.csrf_token),
        session_cookie: non_empty(secret.session_cookie),
        houflow_session_token: non_empty(secret.houflow_session_token),
    }
}

#[cfg(feature = "tauri-runtime")]
fn non_empty(value: Option<String>) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}

fn trim_optional(value: Option<String>) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}

fn required_trimmed(value: String, field: &str) -> Result<String, AppCommandError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        Err(AppCommandError::invalid_input(format!(
            "{field} is required"
        )))
    } else {
        Ok(trimmed.to_string())
    }
}

fn gateway_agent_types() -> Vec<AgentType> {
    vec![
        AgentType::Codex,
        AgentType::ClaudeCode,
        AgentType::Gemini,
        AgentType::Pi,
    ]
}

fn synced_gateway_model(
    existing: Option<&ModelProviderInfo>,
    default_model: Option<String>,
    models: &[String],
) -> Result<Option<String>, AppCommandError> {
    if let Some(existing_model) = existing
        .and_then(|provider| provider.model.as_deref())
        .map(str::trim)
        .filter(|model| !model.is_empty())
    {
        if models.iter().any(|model| model == existing_model) {
            return Ok(Some(existing_model.to_string()));
        }
    }
    Ok(default_model.or_else(|| models.first().cloned()))
}

fn agent_type_id(agent_type: AgentType) -> Result<String, AppCommandError> {
    serde_json::to_value(agent_type)
        .ok()
        .and_then(|value| value.as_str().map(str::to_string))
        .ok_or_else(|| AppCommandError::invalid_input("failed to serialize agent type"))
}

fn normalize_model_list(models: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::BTreeSet::new();
    models
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .filter(|item| seen.insert(item.clone()))
        .collect()
}

async fn find_houflow_provider(
    db: &AppDatabase,
    name: &str,
) -> Result<Option<ModelProviderInfo>, AppCommandError> {
    let providers = model_provider_service::list_all(&db.conn)
        .await
        .map_err(AppCommandError::from)?;
    Ok(providers
        .into_iter()
        .find(|provider| provider.name == name)
        .map(ModelProviderInfo::from))
}

async fn run_connector_json<I, S>(args: I) -> Result<JsonValue, AppCommandError>
where
    I: IntoIterator<Item = S>,
    S: Into<OsString>,
{
    let cli = connector_cli()?;
    run_connector_json_with_cli(&cli, args).await
}

async fn run_connector_json_with_cli<I, S>(
    cli: &ConnectorCli,
    args: I,
) -> Result<JsonValue, AppCommandError>
where
    I: IntoIterator<Item = S>,
    S: Into<OsString>,
{
    let mut command = crate::process::tokio_command(&cli.program);
    for arg in &cli.base_args {
        command.arg(arg);
    }
    for arg in args {
        command.arg(arg.into());
    }
    command.arg("--json");
    command.kill_on_drop(true);

    let output = tokio::time::timeout(CONNECTOR_COMMAND_TIMEOUT, command.output())
        .await
        .map_err(|_| {
            AppCommandError::external_command(
                "hou-agent-connector command timed out",
                format!(
                    "{} exceeded {} seconds",
                    cli.display,
                    CONNECTOR_COMMAND_TIMEOUT.as_secs()
                ),
            )
        })?
        .map_err(|err| {
            AppCommandError::external_command(
                "failed to run hou-agent-connector",
                format!("{}: {err}", cli.display),
            )
        })?;
    if !output.status.success() {
        let detail = command_output_detail(&output.stdout, &output.stderr);
        return Err(AppCommandError::external_command(
            "hou-agent-connector command failed",
            detail,
        ));
    }
    serde_json::from_slice::<JsonValue>(&output.stdout).map_err(|err| {
        AppCommandError::external_command(
            "hou-agent-connector returned invalid JSON",
            format!(
                "{err}; {}",
                command_output_detail(&output.stdout, &output.stderr)
            ),
        )
    })
}

fn connector_cli() -> Result<ConnectorCli, AppCommandError> {
    resolve_connector_cli().ok_or_else(|| {
        AppCommandError::dependency_missing(
            "hou-agent-connector was not found. Install @houflow/agent-connector or set HOUFLOW_AGENT_CONNECTOR_BIN.",
        )
    })
}

fn resolve_connector_cli() -> Option<ConnectorCli> {
    if let Ok(path) = std::env::var("HOUFLOW_AGENT_CONNECTOR_BIN") {
        let path = PathBuf::from(path);
        if path.is_file() {
            return cli_from_path(path);
        }
    }

    for program in ["hou-agent-connector", "agent-connector"] {
        if let Ok(path) = which::which(program) {
            return Some(ConnectorCli {
                display: path.display().to_string(),
                program: path.into_os_string(),
                base_args: Vec::new(),
            });
        }
    }

    for root in candidate_roots() {
        for path in connector_script_candidates(&root) {
            if path.is_file() {
                if let Some(cli) = cli_from_path(path) {
                    return Some(cli);
                }
            }
        }
    }
    None
}

fn cli_from_path(path: PathBuf) -> Option<ConnectorCli> {
    let extension = path.extension().and_then(|ext| ext.to_str()).unwrap_or("");
    if extension == "js" {
        let node = which::which("node").ok()?;
        return Some(ConnectorCli {
            display: format!("{} {}", node.display(), path.display()),
            program: node.into_os_string(),
            base_args: vec![path.into_os_string()],
        });
    }
    #[cfg(windows)]
    if extension.eq_ignore_ascii_case("cmd") || extension.eq_ignore_ascii_case("bat") {
        let shell = std::env::var_os("COMSPEC").unwrap_or_else(|| OsString::from("cmd.exe"));
        return Some(ConnectorCli {
            display: path.display().to_string(),
            program: shell,
            base_args: vec![OsString::from("/C"), path.into_os_string()],
        });
    }
    Some(ConnectorCli {
        display: path.display().to_string(),
        program: path.into_os_string(),
        base_args: Vec::new(),
    })
}

fn candidate_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        push_ancestors(&mut roots, cwd);
    }
    push_ancestors(&mut roots, PathBuf::from(env!("CARGO_MANIFEST_DIR")));
    roots
}

fn push_ancestors(roots: &mut Vec<PathBuf>, path: PathBuf) {
    for ancestor in path.ancestors() {
        let candidate = ancestor.to_path_buf();
        if !roots.iter().any(|root| root == &candidate) {
            roots.push(candidate);
        }
    }
}

fn connector_script_candidates(root: &Path) -> Vec<PathBuf> {
    let bin = if cfg!(windows) {
        "hou-agent-connector.cmd"
    } else {
        "hou-agent-connector"
    };
    vec![
        root.join("node_modules").join(".bin").join(bin),
        root.join("apps")
            .join("houhub2")
            .join("node_modules")
            .join(".bin")
            .join(bin),
        root.join("services")
            .join("agent-connector")
            .join("bin")
            .join("hou-agent-connector.js"),
    ]
}

fn command_output_detail(stdout: &[u8], stderr: &[u8]) -> String {
    let stdout = String::from_utf8_lossy(stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(stderr).trim().to_string();
    match (stdout.is_empty(), stderr.is_empty()) {
        (true, true) => "no output".to_string(),
        (false, true) => stdout,
        (true, false) => stderr,
        (false, false) => format!("stdout:\n{stdout}\n\nstderr:\n{stderr}"),
    }
}

fn default_skills_directory(provider: &str) -> Option<String> {
    let provider = provider.trim();
    if provider.is_empty() {
        return None;
    }
    dirs::home_dir().map(|home| {
        home.join(".houflow")
            .join("agent-skills")
            .join(provider)
            .display()
            .to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::{gateway_agent_types, synced_gateway_model};
    use crate::models::agent::AgentType;
    use crate::models::model_provider::ModelProviderInfo;

    fn provider_with_model(model: Option<&str>) -> ModelProviderInfo {
        ModelProviderInfo {
            id: 1,
            name: "Houflow Gateway".to_string(),
            api_url: "https://agent.houflow.com/api/gateway/openai/v1".to_string(),
            api_key: "sk-test".to_string(),
            api_key_masked: "sk-test".to_string(),
            agent_types: vec![],
            agent_type: "codex".to_string(),
            model: model.map(str::to_string),
            models: vec![],
            created_at: "2026-06-30T00:00:00Z".to_string(),
            updated_at: "2026-06-30T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn gateway_sync_includes_pi() {
        assert!(gateway_agent_types().contains(&AgentType::Pi));
    }

    #[test]
    fn gateway_sync_replaces_stale_claude_bundle_model() {
        let models = vec!["gpt-5.5".to_string(), "gpt-5".to_string()];
        let selected = synced_gateway_model(
            Some(&provider_with_model(Some(r#"{"main":"gpt-5.5"}"#))),
            Some("gpt-5.5".to_string()),
            &models,
        )
        .expect("stale model bundle should migrate instead of blocking sync");

        assert_eq!(selected.as_deref(), Some("gpt-5.5"));
    }

    #[test]
    fn gateway_sync_keeps_existing_valid_model() {
        let models = vec!["gpt-5.5".to_string(), "gpt-5".to_string()];
        let selected = synced_gateway_model(
            Some(&provider_with_model(Some("gpt-5"))),
            Some("gpt-5.5".to_string()),
            &models,
        )
        .expect("valid existing model should stay selected");

        assert_eq!(selected.as_deref(), Some("gpt-5"));
    }
}
