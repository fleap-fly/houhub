//! Persistence of the PS session blob via the OS keyring (desktop) or the
//! server token file (`tauri-runtime` off).

use crate::app_error::AppCommandError;

use super::types::WorkbenchStored;

pub(super) fn load_stored() -> Option<WorkbenchStored> {
    let raw = crate::keyring_store::get_workbench_session()?;
    serde_json::from_str::<WorkbenchStored>(&raw).ok()
}

pub(super) fn persist_stored(stored: &WorkbenchStored) -> Result<(), AppCommandError> {
    let raw = serde_json::to_string(stored).map_err(|e| {
        AppCommandError::external_command("failed to serialize workbench session", e.to_string())
    })?;
    crate::keyring_store::set_workbench_session(&raw)
        .map_err(|e| AppCommandError::task_execution_failed(e))
}
