//! Project System (PS) **project-space** data layer — the portal-neutral
//! "enterprise digital asset center".
//!
//! IMPORTANT: a PS project space is a single shared source of truth
//! (`projectSpaceService`). It is NOT a "business-portal" concept: management
//! users (e.g. finance) and business users (e.g. store managers) all see the
//! same project space, gated only by project membership. We call the
//! `/business/space/*` HTTP surface because its guard is `any_authenticated`
//! (any project member) and its payload exposes folder navigation + presign +
//! usage, which fits a cloud-drive UX. The `/business` segment here is a URL
//! namespace, not an access restriction.
//!
//! Each houhub folder mounted from PS encodes its `projectId` (via the
//! `ps://<projectId>` synthetic path), so these cores take `project_id`
//! explicitly to support switching between multiple projects.

use serde_json::{json, Value as JsonValue};

use crate::app_error::AppCommandError;

use super::client::{ps_delete, ps_get, ps_post};
use super::store::load_stored;
use super::types::WorkbenchStored;

/// The persisted PS session (host + token) or a typed "signed out" error.
pub(super) fn require_session() -> Result<WorkbenchStored, AppCommandError> {
    load_stored()
        .filter(|stored| !stored.session_token.is_empty())
        .ok_or_else(|| AppCommandError::authentication_failed("workbench is not signed in"))
}

pub(super) fn require_project_id(project_id: &str) -> Result<String, AppCommandError> {
    let trimmed = project_id.trim();
    if trimmed.is_empty() {
        return Err(AppCommandError::invalid_input("projectId is required"));
    }
    Ok(trimmed.to_string())
}

/// List folders + files under `folder_path` (defaults to "/") or, when
/// `search` is given, the matching items across the space.
pub async fn workbench_space_list_core(
    project_id: String,
    folder_path: Option<String>,
    search: Option<String>,
) -> Result<JsonValue, AppCommandError> {
    let project_id = require_project_id(&project_id)?;
    let session = require_session()?;

    let folder_path = folder_path.unwrap_or_else(|| "/".to_string());
    let search = search.unwrap_or_default();
    let mut query: Vec<(&str, &str)> = Vec::new();
    if !search.trim().is_empty() {
        query.push(("search", search.as_str()));
    } else {
        query.push(("folder_path", folder_path.as_str()));
    }

    ps_get(
        &session.host,
        &session.session_token,
        &project_id,
        "/space/files",
        &query,
    )
    .await
}

/// Storage usage for the project: `{ used, total, percentage }`.
pub async fn workbench_space_usage_core(project_id: String) -> Result<JsonValue, AppCommandError> {
    let project_id = require_project_id(&project_id)?;
    let session = require_session()?;
    ps_get(
        &session.host,
        &session.session_token,
        &project_id,
        "/space/usage",
        &[],
    )
    .await
}

/// A short-lived presigned URL for a file. `disposition` is "inline"
/// (preview/edit) or "attachment" (download).
pub async fn workbench_space_download_url_core(
    project_id: String,
    file_id: String,
    disposition: Option<String>,
) -> Result<JsonValue, AppCommandError> {
    let project_id = require_project_id(&project_id)?;
    let file_id = file_id.trim().to_string();
    if file_id.is_empty() {
        return Err(AppCommandError::invalid_input("fileId is required"));
    }
    let session = require_session()?;
    let disposition = match disposition.as_deref() {
        Some("attachment") => "attachment",
        _ => "inline",
    };
    let path = format!("/space/files/{file_id}/download-url");
    ps_get(
        &session.host,
        &session.session_token,
        &project_id,
        &path,
        &[("disposition", disposition)],
    )
    .await
}

/// Create a logical folder under `parent_id` (or the root).
pub async fn workbench_space_create_folder_core(
    project_id: String,
    folder_name: String,
    parent_id: Option<String>,
) -> Result<JsonValue, AppCommandError> {
    let project_id = require_project_id(&project_id)?;
    let folder_name = folder_name.trim().to_string();
    if folder_name.is_empty() {
        return Err(AppCommandError::invalid_input("folderName is required"));
    }
    let session = require_session()?;
    let mut body = json!({ "folder_name": folder_name });
    if let Some(parent) = parent_id
        .as_ref()
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
    {
        body["parent_id"] = json!(parent);
    }
    ps_post(
        &session.host,
        &session.session_token,
        &project_id,
        "/space/folders",
        body,
    )
    .await
}

/// Begin a direct-to-storage upload: returns `{ file_id, upload_url, ... }`.
/// The webview PUTs the bytes to `upload_url`, then calls complete-upload.
/// PS enforces the project storage quota here (over-quota → typed error).
pub async fn workbench_space_presign_upload_core(
    project_id: String,
    file_name: String,
    mime_type: Option<String>,
    size: i64,
    folder_path: Option<String>,
) -> Result<JsonValue, AppCommandError> {
    let project_id = require_project_id(&project_id)?;
    let file_name = file_name.trim().to_string();
    if file_name.is_empty() {
        return Err(AppCommandError::invalid_input("fileName is required"));
    }
    if size <= 0 {
        return Err(AppCommandError::invalid_input(
            "size must be a positive integer",
        ));
    }
    let session = require_session()?;
    let mut body = json!({ "file_name": file_name, "size": size });
    if let Some(mime) = mime_type
        .as_ref()
        .map(|m| m.trim())
        .filter(|m| !m.is_empty())
    {
        body["mime_type"] = json!(mime);
    }
    if let Some(folder) = folder_path
        .as_ref()
        .map(|f| f.trim())
        .filter(|f| !f.is_empty())
    {
        body["folder_path"] = json!(folder);
    }
    ps_post(
        &session.host,
        &session.session_token,
        &project_id,
        "/space/files/presign-upload",
        body,
    )
    .await
}

/// Finalize an upload after the webview PUT succeeds, materializing the item.
pub async fn workbench_space_complete_upload_core(
    project_id: String,
    file_id: String,
    mime_type: Option<String>,
    folder_path: Option<String>,
) -> Result<JsonValue, AppCommandError> {
    let project_id = require_project_id(&project_id)?;
    let file_id = file_id.trim().to_string();
    if file_id.is_empty() {
        return Err(AppCommandError::invalid_input("fileId is required"));
    }
    let session = require_session()?;
    let mut body = json!({ "file_id": file_id });
    if let Some(mime) = mime_type
        .as_ref()
        .map(|m| m.trim())
        .filter(|m| !m.is_empty())
    {
        body["mime_type"] = json!(mime);
    }
    if let Some(folder) = folder_path
        .as_ref()
        .map(|f| f.trim())
        .filter(|f| !f.is_empty())
    {
        body["folder_path"] = json!(folder);
    }
    ps_post(
        &session.host,
        &session.session_token,
        &project_id,
        "/space/files/complete-upload",
        body,
    )
    .await
}

/// Soft-delete a file (PS keeps it in the recycle bin).
pub async fn workbench_space_delete_file_core(
    project_id: String,
    file_id: String,
) -> Result<JsonValue, AppCommandError> {
    let project_id = require_project_id(&project_id)?;
    let file_id = file_id.trim().to_string();
    if file_id.is_empty() {
        return Err(AppCommandError::invalid_input("fileId is required"));
    }
    let session = require_session()?;
    let path = format!("/space/files/{file_id}");
    ps_delete(&session.host, &session.session_token, &project_id, &path).await?;
    Ok(json!({ "ok": true }))
}
