export type ArtifactSourceKind =
  | "local_workspace"
  | "remote_workspace"
  | "houflow_session_output"
  | "houflow_hosted_command"
  | "workbench_project_space"
  | "workbench_agent_artifact"

export interface ArtifactTarget {
  kind: ArtifactSourceKind
  label: string
}

export interface WorkspaceArtifactTarget extends ArtifactTarget {
  kind: "local_workspace" | "remote_workspace" | "workbench_project_space"
  relativePath: string
  line?: number | null
}

export interface HouflowSessionOutputTarget extends ArtifactTarget {
  kind: "houflow_session_output"
  sessionId: string
  target: string
}

export interface HouflowHostedCommandArtifactTarget extends ArtifactTarget {
  kind: "houflow_hosted_command"
  commandId: string
  target: string
}

export interface WorkbenchAgentArtifactTarget extends ArtifactTarget {
  kind: "workbench_agent_artifact"
  projectId: string
  sessionId: string
  target: string
}

export type ResolvedArtifactTarget =
  | WorkspaceArtifactTarget
  | HouflowSessionOutputTarget
  | HouflowHostedCommandArtifactTarget
  | WorkbenchAgentArtifactTarget
