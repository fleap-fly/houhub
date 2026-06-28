//! Serializable types shared across the workbench (PS) data layer.

use serde::{Deserialize, Serialize};

use super::client::DEFAULT_HOST;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchUser {
    pub id: String,
    pub email: Option<String>,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchProject {
    pub project_id: String,
    pub name: String,
    pub role: String,
}

/// The secret blob persisted to the keyring / server token file.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct WorkbenchStored {
    pub(super) host: String,
    pub(super) session_token: String,
    pub(super) active_project_id: String,
    #[serde(default)]
    pub(super) user: WorkbenchUser,
    #[serde(default)]
    pub(super) projects: Vec<WorkbenchProject>,
}

/// Non-secret session surface returned to the webview.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchSession {
    pub status: String,
    pub host: String,
    pub user: Option<WorkbenchUser>,
    pub active_project_id: Option<String>,
    pub projects: Vec<WorkbenchProject>,
    pub expires_at: Option<String>,
}

impl WorkbenchSession {
    pub(super) fn signed_out() -> Self {
        WorkbenchSession {
            status: "signed_out".to_string(),
            host: DEFAULT_HOST.to_string(),
            user: None,
            active_project_id: None,
            projects: Vec::new(),
            expires_at: None,
        }
    }
}

pub(super) fn session_from_stored(stored: WorkbenchStored) -> WorkbenchSession {
    WorkbenchSession {
        status: "signed_in".to_string(),
        host: stored.host,
        user: Some(stored.user),
        active_project_id: Some(stored.active_project_id),
        projects: stored.projects,
        expires_at: None,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceAuthStart {
    pub device_code: String,
    pub authorize_url: String,
    pub poll_interval_seconds: u64,
    pub expires_in_seconds: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PsDeviceAuthPoll {
    pub(super) status: String,
    pub(super) session_token: Option<String>,
    pub(super) active_project_id: Option<String>,
    pub(super) user: Option<WorkbenchUser>,
    pub(super) projects: Option<Vec<WorkbenchProject>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceAuthPollResult {
    pub status: String,
    pub user: Option<WorkbenchUser>,
    pub active_project_id: Option<String>,
    pub projects: Option<Vec<WorkbenchProject>>,
}
