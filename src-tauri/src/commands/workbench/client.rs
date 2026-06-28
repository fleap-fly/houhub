//! HTTP plumbing for talking to Project System (PS).
//!
//! All PS calls are made from the Rust backend so the webview never holds the
//! PS session token and never makes a cross-origin request. Authenticated
//! "space" calls carry the desktop session header plus the project-context
//! header that PS's `resolveProjectContext` reads.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde_json::Value as JsonValue;

use crate::app_error::AppCommandError;

pub(super) const API_PREFIX: &str = "/api/project-system";
pub const DEFAULT_HOST: &str = "https://next.houshanai.com";
pub(super) const DESKTOP_SESSION_HEADER: &str = "x-ps-desktop-session";
/// Header PS reads (`requestUtils.extractExplicitProjectId`) to bind a request
/// to a project when the host is not project-locked.
pub(super) const PROJECT_ID_HEADER: &str = "x-auth-project-id";
pub(super) const CLIENT_ID: &str = "houhub-desktop";
pub(super) const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// Maps a pending `deviceCode` to the host it was created against, so `poll`
/// can target the same PS deployment without the webview threading the host
/// through. Process-lifetime is sufficient (device codes expire in minutes).
pub(super) fn pending_hosts() -> &'static Mutex<HashMap<String, String>> {
    static MAP: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

pub(super) fn normalize_host(host: &str) -> String {
    let trimmed = host.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        DEFAULT_HOST.to_string()
    } else {
        trimmed.to_string()
    }
}

pub(super) fn http_client() -> Result<reqwest::Client, AppCommandError> {
    reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| {
            AppCommandError::external_command("failed to build HTTP client", e.to_string())
        })
}

pub(super) fn request_error(err: reqwest::Error) -> AppCommandError {
    AppCommandError::external_command("project-system request failed", err.to_string())
}

pub(super) async fn parse_json<T: serde::de::DeserializeOwned>(
    resp: reqwest::Response,
) -> Result<T, AppCommandError> {
    let status = resp.status();
    let text = resp.text().await.map_err(request_error)?;
    if !status.is_success() {
        return Err(AppCommandError::external_command(
            "project-system returned an error",
            format!("status {status}: {text}"),
        ));
    }
    serde_json::from_str::<T>(&text).map_err(|e| {
        AppCommandError::external_command(
            "project-system returned an invalid response",
            format!("{e}: {text}"),
        )
    })
}

fn business_url(host: &str, path: &str) -> String {
    format!("{host}{API_PREFIX}/business{path}")
}

/// Authenticated GET against a `/business{path}` PS endpoint bound to
/// `project_id`. `query` pairs are URL-encoded by reqwest.
pub(super) async fn ps_get(
    host: &str,
    token: &str,
    project_id: &str,
    path: &str,
    query: &[(&str, &str)],
) -> Result<JsonValue, AppCommandError> {
    let resp = http_client()?
        .get(business_url(host, path))
        .query(query)
        .header(DESKTOP_SESSION_HEADER, token)
        .header(PROJECT_ID_HEADER, project_id)
        .send()
        .await
        .map_err(request_error)?;
    parse_json(resp).await
}

/// Authenticated POST (JSON body) against a `/business{path}` PS endpoint.
pub(super) async fn ps_post(
    host: &str,
    token: &str,
    project_id: &str,
    path: &str,
    body: JsonValue,
) -> Result<JsonValue, AppCommandError> {
    let resp = http_client()?
        .post(business_url(host, path))
        .header(DESKTOP_SESSION_HEADER, token)
        .header(PROJECT_ID_HEADER, project_id)
        .json(&body)
        .send()
        .await
        .map_err(request_error)?;
    parse_json(resp).await
}

/// Authenticated DELETE against a `/business{path}` PS endpoint. PS replies 204
/// with an empty body on success, so we only assert the status.
pub(super) async fn ps_delete(
    host: &str,
    token: &str,
    project_id: &str,
    path: &str,
) -> Result<(), AppCommandError> {
    let resp = http_client()?
        .delete(business_url(host, path))
        .header(DESKTOP_SESSION_HEADER, token)
        .header(PROJECT_ID_HEADER, project_id)
        .send()
        .await
        .map_err(request_error)?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(AppCommandError::external_command(
            "project-system returned an error",
            format!("status {status}: {text}"),
        ));
    }
    Ok(())
}
