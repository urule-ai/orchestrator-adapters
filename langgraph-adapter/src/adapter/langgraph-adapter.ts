import { ulid } from 'ulid';
import type {
  ApprovalRequest,
  Artifact,
  ArtifactRef,
  HandoffParams,
  OrchestratorAdapter,
  OrchestratorCapabilities,
  ResumeInput,
  RunHandle,
  RunState,
  RunStatus,
  StartRunParams,
} from '@urule/orchestrator-contract';

// Re-export contract types so route handlers and tests have a single place
// to import from without reaching across the package boundary.
export type {
  ApprovalRequest,
  Artifact,
  ArtifactRef,
  HandoffParams,
  OrchestratorAdapter,
  OrchestratorCapabilities,
  ResumeInput,
  RunHandle,
  RunState,
  RunStatus,
  StartRunParams,
};

interface RunRecord {
  runId: string;
  agentId: string;
  workspaceId: string;
  graphId?: string;
  status: RunStatus;
  startedAt: string;
  completedAt?: string;
  input: Record<string, unknown>;
  pendingApprovals: string[];
  artifacts: ArtifactRef[];
  output?: Record<string, unknown>;
  error?: string;
}

export class LangGraphAdapter implements OrchestratorAdapter {
  private readonly runs = new Map<string, RunRecord>();
  private readonly langgraphServerUrl: string;

  constructor(langgraphServerUrl: string) {
    this.langgraphServerUrl = langgraphServerUrl;
  }

  async startRun(params: StartRunParams): Promise<RunHandle> {
    const runId = ulid();
    const now = new Date().toISOString();
    const graphId = readString(params.config, 'graphId');

    const record: RunRecord = {
      runId,
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      status: 'running',
      startedAt: now,
      input: params.input,
      pendingApprovals: [],
      artifacts: [],
      ...(graphId !== undefined ? { graphId } : {}),
    };

    this.runs.set(runId, record);
    return { runId, status: record.status };
  }

  async pauseForApproval(runId: string, approval: ApprovalRequest): Promise<void> {
    const record = this.requireRun(runId);
    record.status = 'paused';
    record.pendingApprovals.push(approval.id ?? ulid());
  }

  async resumeRun(runId: string, input: ResumeInput): Promise<void> {
    const record = this.requireRun(runId);
    if (input.approvalId !== undefined) {
      record.pendingApprovals = record.pendingApprovals.filter((id) => id !== input.approvalId);
    } else {
      record.pendingApprovals = [];
    }
    record.status = 'running';
  }

  async cancelRun(runId: string, _reason: string): Promise<void> {
    const record = this.requireRun(runId);
    record.status = 'cancelled';
    record.completedAt = new Date().toISOString();
  }

  async getState(runId: string): Promise<RunState> {
    const record = this.requireRun(runId);
    return {
      runId: record.runId,
      status: record.status,
      pendingApprovals: [...record.pendingApprovals],
      artifacts: [...record.artifacts],
      startedAt: record.startedAt,
      ...(record.completedAt !== undefined ? { completedAt: record.completedAt } : {}),
      ...(record.output !== undefined ? { output: record.output } : {}),
      ...(record.error !== undefined ? { error: record.error } : {}),
    };
  }

  async emitArtifact(runId: string, artifact: Artifact): Promise<void> {
    const record = this.requireRun(runId);
    record.artifacts.push({
      id: ulid(),
      type: artifact.type,
      name: artifact.name,
    });
  }

  async handoffAgent(runId: string, _params: HandoffParams): Promise<void> {
    this.requireRun(runId);
  }

  getCapabilities(): OrchestratorCapabilities {
    return {
      durableCheckpoints: true,
      humanInTheLoop: true,
      subgraphs: true,
      streaming: true,
      artifactEmission: true,
      cancellation: true,
      resumability: true,
    };
  }

  private requireRun(runId: string): RunRecord {
    const record = this.runs.get(runId);
    if (!record) {
      throw new Error(`Run not found: ${runId}`);
    }
    return record;
  }
}

function readString(obj: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!obj) return undefined;
  const value = obj[key];
  return typeof value === 'string' ? value : undefined;
}
