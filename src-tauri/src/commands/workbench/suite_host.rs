use serde::{Deserialize, Serialize};

use crate::app_error::AppCommandError;

use super::client::{http_client, parse_json, request_error, API_PREFIX, DESKTOP_SESSION_HEADER};
use super::store::load_stored;

const MAX_IDENTIFIER_LENGTH: usize = 200;
const MAX_CALL_ID_LENGTH: usize = 128;
const SUITE_ROUTE_PATH: &str = "/operations/suites";
const DESKTOP_SUITE_HOST: &str = "desktop";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchSuiteOpenRequest {
    pub url: String,
    pub suite_code: String,
    pub view_id: String,
    pub project_id: String,
    pub call_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchSuiteHostResult {
    pub host_session_id: String,
    pub normalized_url: String,
    pub host_status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchClientSuite {
    pub code: String,
    pub name: String,
    pub view_id: String,
    pub project_id: String,
    pub url: String,
}

#[derive(Debug, Clone)]
struct ValidatedSuiteOpen {
    canonical_url: reqwest::Url,
    redirect_path: String,
    window_label: String,
    project_id: String,
    suite_code: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserLaunchResponse {
    launch_path: String,
}

#[derive(Debug, Deserialize)]
struct SuiteDiscoveryResponse {
    #[serde(default)]
    items: Vec<SuiteDiscoveryItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SuiteDiscoveryItem {
    code: String,
    name: Option<String>,
    installed: bool,
    client: Option<SuiteDiscoveryClient>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SuiteDiscoveryClient {
    view_id: String,
    url: String,
}

pub async fn workbench_list_client_suites_core(
    project_id: String,
) -> Result<Vec<WorkbenchClientSuite>, AppCommandError> {
    let project_id = bounded_identifier(&project_id, "projectId")?;
    let stored = load_stored().ok_or_else(|| {
        AppCommandError::authentication_failed("Workbench session is not signed in")
    })?;
    if stored.active_project_id.trim() != project_id {
        return Err(AppCommandError::permission_denied(
            "Suite catalog project does not match the active Workbench project",
        ));
    }
    let value = super::client::ps_admin_get(
        &stored.host,
        &stored.session_token,
        &project_id,
        "/suites/discover",
        &[],
    )
    .await?;
    let response: SuiteDiscoveryResponse = serde_json::from_value(value).map_err(|error| {
        AppCommandError::external_command(
            "Project System returned an invalid suite catalog",
            error.to_string(),
        )
    })?;
    let host = absolute_http_url(&stored.host, "Workbench host")?;
    let mut suites = Vec::new();
    for item in response.items {
        let Some(client) = item.client.filter(|_| item.installed) else {
            continue;
        };
        let code = bounded_identifier(&item.code, "suiteCode")?;
        let view_id = bounded_identifier(&client.view_id, "viewId")?;
        let url = absolute_http_url(&client.url, "Suite URL")?;
        if url.origin() != host.origin() {
            return Err(AppCommandError::permission_denied(
                "Suite catalog URL origin does not match the signed-in Workbench",
            ));
        }
        suites.push(WorkbenchClientSuite {
            name: item
                .name
                .filter(|name| !name.trim().is_empty())
                .unwrap_or_else(|| code.clone()),
            code,
            view_id,
            project_id: project_id.clone(),
            url: url.to_string(),
        });
    }
    suites.sort_by(|left, right| left.name.cmp(&right.name).then(left.code.cmp(&right.code)));
    Ok(suites)
}

#[cfg(feature = "tauri-runtime")]
pub async fn workbench_open_suite_core(
    app: tauri::AppHandle,
    input: WorkbenchSuiteOpenRequest,
) -> Result<WorkbenchSuiteHostResult, AppCommandError> {
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

    let stored = load_stored().ok_or_else(|| {
        AppCommandError::authentication_failed("Workbench session is not signed in")
    })?;
    if stored.session_token.trim().is_empty() {
        return Err(AppCommandError::authentication_failed(
            "Workbench session token is missing",
        ));
    }
    let validated = validate_suite_open(&stored.host, &stored.active_project_id, &input)?;

    if let Some(existing) = app.get_webview_window(&validated.window_label) {
        let _ = existing.unminimize();
        let _ = existing.show();
        existing.set_focus().map_err(|error| {
            AppCommandError::window("Failed to focus Workbench suite", error.to_string())
        })?;
        return Ok(WorkbenchSuiteHostResult {
            host_session_id: validated.window_label,
            normalized_url: validated.canonical_url.to_string(),
            host_status: "focused".to_string(),
        });
    }

    let launch_url = create_browser_launch(
        &stored.host,
        &stored.session_token,
        &validated.project_id,
        &validated.redirect_path,
    )
    .await?;
    let allowed_launch_url = launch_url.clone();
    let allowed_suite_url = validated.canonical_url.clone();
    let allowed_suite_code = validated.suite_code.clone();
    let allowed_project_id = validated.project_id.clone();
    WebviewWindowBuilder::new(
        &app,
        &validated.window_label,
        WebviewUrl::External(launch_url),
    )
    .on_navigation(move |url| {
        is_allowed_suite_navigation(
            url,
            &allowed_launch_url,
            &allowed_suite_url,
            &allowed_suite_code,
            &allowed_project_id,
        )
    })
    .title("HouHub Workbench")
    .inner_size(1440.0, 900.0)
    .min_inner_size(900.0, 640.0)
    .center()
    .build()
    .map_err(|error| {
        AppCommandError::window("Failed to open Workbench suite", error.to_string())
    })?;

    Ok(WorkbenchSuiteHostResult {
        host_session_id: validated.window_label,
        normalized_url: validated.canonical_url.to_string(),
        host_status: "opened".to_string(),
    })
}

fn validate_suite_open(
    session_host: &str,
    active_project_id: &str,
    input: &WorkbenchSuiteOpenRequest,
) -> Result<ValidatedSuiteOpen, AppCommandError> {
    let host = absolute_http_url(session_host, "Workbench host")?;
    let canonical_url = absolute_http_url(&input.url, "Suite URL")?;
    if host.origin() != canonical_url.origin() {
        return Err(AppCommandError::permission_denied(
            "Suite URL origin does not match the signed-in Workbench",
        ));
    }
    let project_id = bounded_identifier(&input.project_id, "projectId")?;
    if project_id != active_project_id.trim() {
        return Err(AppCommandError::permission_denied(
            "Suite project does not match the active Workbench project",
        ));
    }
    let suite_code = bounded_identifier(&input.suite_code, "suiteCode")?;
    let view_id = bounded_identifier(&input.view_id, "viewId")?;
    if canonical_url.path() != SUITE_ROUTE_PATH
        || !has_single_query_value(&canonical_url, "host", DESKTOP_SUITE_HOST)
        || !has_single_query_value(&canonical_url, "suite", &suite_code)
        || !has_single_query_value(&canonical_url, "view", &view_id)
        || !has_single_query_value(&canonical_url, "psProjectId", &project_id)
    {
        return Err(AppCommandError::permission_denied(
            "Suite URL does not match the authorized desktop suite target",
        ));
    }
    let call_id = validated_call_id(&input.call_id)?;
    let mut redirect_path = canonical_url.path().to_string();
    if let Some(query) = canonical_url.query() {
        redirect_path.push('?');
        redirect_path.push_str(query);
    }
    if let Some(fragment) = canonical_url.fragment() {
        redirect_path.push('#');
        redirect_path.push_str(fragment);
    }
    Ok(ValidatedSuiteOpen {
        canonical_url,
        redirect_path,
        window_label: format!("workbench-suite-{call_id}"),
        project_id,
        suite_code,
    })
}

fn is_allowed_suite_navigation(
    candidate: &reqwest::Url,
    launch_url: &reqwest::Url,
    suite_url: &reqwest::Url,
    suite_code: &str,
    project_id: &str,
) -> bool {
    if candidate == launch_url {
        return true;
    }
    candidate.origin() == suite_url.origin()
        && candidate.path() == SUITE_ROUTE_PATH
        && has_single_query_value(candidate, "host", DESKTOP_SUITE_HOST)
        && has_single_query_value(candidate, "suite", suite_code)
        && has_single_query_value(candidate, "psProjectId", project_id)
}

fn has_single_query_value(url: &reqwest::Url, key: &str, expected: &str) -> bool {
    let mut values = url
        .query_pairs()
        .filter_map(|(candidate_key, value)| (candidate_key == key).then_some(value));
    matches!(values.next(), Some(value) if value == expected) && values.next().is_none()
}

async fn create_browser_launch(
    session_host: &str,
    session_token: &str,
    project_id: &str,
    redirect_path: &str,
) -> Result<reqwest::Url, AppCommandError> {
    let host = absolute_http_url(session_host, "Workbench host")?;
    let endpoint = host
        .join(&format!("{API_PREFIX}/public/desktop/browser-launches"))
        .map_err(|error| {
            AppCommandError::configuration_invalid(format!(
                "Workbench browser launch endpoint is invalid: {error}"
            ))
        })?;
    let response = http_client()?
        .post(endpoint)
        .header(DESKTOP_SESSION_HEADER, session_token)
        .json(&serde_json::json!({
            "projectId": project_id,
            "redirectPath": redirect_path,
        }))
        .send()
        .await
        .map_err(request_error)?;
    let launch: BrowserLaunchResponse = parse_json(response).await?;
    if !launch.launch_path.starts_with('/') || launch.launch_path.starts_with("//") {
        return Err(AppCommandError::configuration_invalid(
            "Project System returned an invalid browser launch path",
        ));
    }
    let launch_url = host.join(&launch.launch_path).map_err(|error| {
        AppCommandError::configuration_invalid(format!(
            "Project System browser launch URL is invalid: {error}"
        ))
    })?;
    if launch_url.origin() != host.origin() {
        return Err(AppCommandError::permission_denied(
            "Project System browser launch left the Workbench origin",
        ));
    }
    Ok(launch_url)
}

fn absolute_http_url(value: &str, field: &str) -> Result<reqwest::Url, AppCommandError> {
    let url = reqwest::Url::parse(value.trim())
        .map_err(|_| AppCommandError::invalid_input(format!("{field} must be an absolute URL")))?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(AppCommandError::invalid_input(format!(
            "{field} must be an absolute HTTP(S) URL without credentials"
        )));
    }
    Ok(url)
}

fn bounded_identifier(value: &str, field: &str) -> Result<String, AppCommandError> {
    let normalized = value.trim();
    if normalized.is_empty() || normalized.len() > MAX_IDENTIFIER_LENGTH {
        return Err(AppCommandError::invalid_input(format!(
            "{field} is required and must be at most {MAX_IDENTIFIER_LENGTH} bytes"
        )));
    }
    Ok(normalized.to_string())
}

fn validated_call_id(value: &str) -> Result<String, AppCommandError> {
    let call_id = value.trim();
    if call_id.is_empty()
        || call_id.len() > MAX_CALL_ID_LENGTH
        || !call_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(AppCommandError::invalid_input(
            "callId contains unsupported window-label characters",
        ));
    }
    Ok(call_id.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn suite_url(origin: &str, view_id: &str) -> String {
        format!(
            "{origin}/operations/suites?suite=creative_design_studio&view={view_id}&psProjectId=project_1&host=desktop"
        )
    }

    fn request(url: &str) -> WorkbenchSuiteOpenRequest {
        WorkbenchSuiteOpenRequest {
            url: url.to_string(),
            suite_code: "creative_design_studio".to_string(),
            view_id: "suite.creative_design_studio.workspace".to_string(),
            project_id: "project_1".to_string(),
            call_id: "wbcc_1".to_string(),
        }
    }

    #[test]
    fn validates_same_origin_project_and_deterministic_window() {
        let validated = validate_suite_open(
            "https://project.example.test",
            "project_1",
            &request(&format!(
                "{}#canvas",
                suite_url(
                    "https://project.example.test",
                    "suite.creative_design_studio.workspace"
                )
            )),
        )
        .expect("valid suite request");
        assert_eq!(validated.window_label, "workbench-suite-wbcc_1");
        assert_eq!(
            validated.redirect_path,
            "/operations/suites?suite=creative_design_studio&view=suite.creative_design_studio.workspace&psProjectId=project_1&host=desktop#canvas"
        );
    }

    #[test]
    fn rejects_cross_origin_and_project_mismatch() {
        let origin_error = validate_suite_open(
            "https://project.example.test",
            "project_1",
            &request(&suite_url(
                "https://other.example.test",
                "suite.creative_design_studio.workspace",
            )),
        )
        .expect_err("cross-origin URL must fail");
        assert!(origin_error.message.contains("origin"));

        let mut mismatched = request(&suite_url(
            "https://project.example.test",
            "suite.creative_design_studio.workspace",
        ));
        mismatched.project_id = "project_2".to_string();
        let project_error =
            validate_suite_open("https://project.example.test", "project_1", &mismatched)
                .expect_err("project mismatch must fail");
        assert!(project_error.message.contains("project"));
    }

    #[test]
    fn rejects_unsafe_protocol_credentials_and_call_id() {
        assert!(validate_suite_open(
            "https://project.example.test",
            "project_1",
            &request("file:///tmp/suite"),
        )
        .is_err());
        assert!(validate_suite_open(
            "https://project.example.test",
            "project_1",
            &request("https://user:secret@project.example.test/suite"),
        )
        .is_err());
        let mut invalid_call = request(&suite_url(
            "https://project.example.test",
            "suite.creative_design_studio.workspace",
        ));
        invalid_call.call_id = "../main".to_string();
        assert!(
            validate_suite_open("https://project.example.test", "project_1", &invalid_call,)
                .is_err()
        );
    }

    #[test]
    fn rejects_unpinned_or_mismatched_suite_urls() {
        let missing_host = request(
            "https://project.example.test/operations/suites?suite=creative_design_studio&view=suite.creative_design_studio.workspace&psProjectId=project_1",
        );
        assert!(
            validate_suite_open("https://project.example.test", "project_1", &missing_host)
                .is_err()
        );

        let wrong_suite = request(
            "https://project.example.test/operations/suites?suite=other_suite&view=suite.creative_design_studio.workspace&psProjectId=project_1&host=desktop",
        );
        assert!(
            validate_suite_open("https://project.example.test", "project_1", &wrong_suite).is_err()
        );

        let duplicate_project = request(
            "https://project.example.test/operations/suites?suite=creative_design_studio&view=suite.creative_design_studio.workspace&psProjectId=project_1&psProjectId=project_2&host=desktop",
        );
        assert!(validate_suite_open(
            "https://project.example.test",
            "project_1",
            &duplicate_project,
        )
        .is_err());
    }

    #[test]
    fn navigation_policy_allows_only_the_authorized_suite() {
        let launch_url = reqwest::Url::parse(
            "https://project.example.test/api/project-system/public/desktop/browser-launches/consume?code=one-time",
        )
        .unwrap();
        let initial_suite_url = reqwest::Url::parse(&suite_url(
            "https://project.example.test",
            "suite.creative_design_studio.workspace",
        ))
        .unwrap();
        let other_view = reqwest::Url::parse(
            "https://project.example.test/operations/suites?suite=creative_design_studio&view=suite.creative_design_studio.assets&psProjectId=project_1&host=desktop#asset",
        )
        .unwrap();

        assert!(is_allowed_suite_navigation(
            &launch_url,
            &launch_url,
            &initial_suite_url,
            "creative_design_studio",
            "project_1",
        ));
        assert!(is_allowed_suite_navigation(
            &initial_suite_url,
            &launch_url,
            &initial_suite_url,
            "creative_design_studio",
            "project_1",
        ));
        assert!(is_allowed_suite_navigation(
            &other_view,
            &launch_url,
            &initial_suite_url,
            "creative_design_studio",
            "project_1",
        ));

        for blocked in [
            "https://project.example.test/operations/suites?suite=other_suite&view=suite.other.workspace&psProjectId=project_1&host=desktop",
            "https://project.example.test/operations/suites?suite=creative_design_studio&view=suite.creative_design_studio.workspace&psProjectId=project_2&host=desktop",
            "https://project.example.test/operations/suites?suite=creative_design_studio&view=suite.creative_design_studio.workspace&psProjectId=project_1",
            "https://project.example.test/settings/integrations?psProjectId=project_1",
            "https://other.example.test/operations/suites?suite=creative_design_studio&view=suite.creative_design_studio.workspace&psProjectId=project_1&host=desktop",
        ] {
            let candidate = reqwest::Url::parse(blocked).unwrap();
            assert!(!is_allowed_suite_navigation(
                &candidate,
                &launch_url,
                &initial_suite_url,
                "creative_design_studio",
                "project_1",
            ));
        }
    }
}
