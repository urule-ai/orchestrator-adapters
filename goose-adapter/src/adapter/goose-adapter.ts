import { ulid } from 'ulid';
import type { OrchestratorAdapter } from '@urule/orchestrator-contract';
import type {
  ApprovalRequest,
  Artifact,
  HandoffParams,
  OrchestratorCapabilities,
  ResumeInput,
  RunHandle,
  RunState,
  RunStatus,
  StartRunParams,
  ArtifactRef,
} from '@urule/orchestrator-contract';
import type { GooseClient } from '../goose/goose-client.js';

interface GooseRun {
  runId: string;
  sessionId: string;
  agentId: string;
  workspaceId: string;
  startedAt: string;
  completedAt?: string;
  pendingApprovals: string[];
  artifacts: ArtifactRef[];
}

export class GooseAdapter implements OrchestratorAdapter {
  private readonly runs = new Map<string, GooseRun>();

  constructor(private readonly goose: GooseClient) {}

  async startRun(params: StartRunParams): Promise<RunHandle> {
    const initialInput = extractInitialInput(params.input);
    const session = await this.goose.startSession({
      recipe: readString(params.config, 'recipe'),
      recipePath: readString(params.config, 'recipePath'),
      model: readString(params.config, 'model'),
      provider: readString(params.config, 'provider'),
      extensions: params.mcpBindings,
      initialInput,
    });

    const runId = ulid();
    this.runs.set(runId, {
      runId,
      sessionId: session.sessionId,
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      startedAt: new Date().toISOString(),
      pendingApprovals: [],
      artifacts: [],
    });

    return { runId, status: session.status };
  }

  async pauseForApproval(runId: string, _approval: ApprovalRequest): Promise<void> {
    const run = this.requireRun(runId);
    await this.goose.pauseSession(run.sessionId);
    run.pendingApprovals.push(ulid());
  }

  async resumeRun(runId: string, input: ResumeInput): Promise<void> {
    const run = this.requireRun(runId);
    const resumeText = readString(input.data, 'message');
    await this.goose.resumeSession(run.sessionId, resumeText);
    if (input.approvalId !== undefined) {
      run.pendingApprovals = run.pendingApprovals.filter((id) => id !== input.approvalId);
    } else {
      run.pendingApprovals = [];
    }
  }

  async cancelRun(runId: string, reason: string): Promise<void> {
    const run = this.requireRun(runId);
    await this.goose.cancelSession(run.sessionId, reason);
    run.completedAt = new Date().toISOString();
  }

  async getState(runId: string): Promise<RunState> {
    const run = this.requireRun(runId);
    const session = await this.goose.getSessionState(run.sessionId);
    return {
      runId: run.runId,
      status: mapStatus(session.status),
      pendingApprovals: [...run.pendingApprovals],
      artifacts: [...run.artifacts],
      startedAt: run.startedAt,
      ...(session.completedAt !== undefined ? { completedAt: session.completedAt } : {}),
      ...(session.output !== undefined ? { output: { text: session.output } } : {}),
      ...(session.error !== undefined ? { error: session.error } : {}),
    };
  }

  async emitArtifact(runId: string, artifact: Artifact): Promise<void> {
    const run = this.requireRun(runId);
    run.artifacts.push({ id: ulid(), type: artifact.type, name: artifact.name });
  }

  async handoffAgent(runId: string, _params: HandoffParams): Promise<void> {
    // Goose has no first-class handoff primitive today. A richer impl would
    // stop the current session and start a new one with the target agent's
    // recipe, forwarding context. For the spike we just validate the run
    // exists so callers get a consistent error shape.
    this.requireRun(runId);
  }

  getCapabilities(): OrchestratorCapabilities {
    return {
      durableCheckpoints: false,
      humanInTheLoop: true,
      subgraphs: true,
      streaming: true,
      artifactEmission: true,
      cancellation: true,
      resumability: true,
    };
  }

  private requireRun(runId: string): GooseRun {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    return run;
  }
}

function mapStatus(status: string): RunStatus {
  switch (status) {
    case 'running':
    case 'paused':
    case 'completed':
    case 'cancelled':
    case 'failed':
      return status;
    default:
      return 'pending';
  }
}

function extractInitialInput(input: Record<string, unknown>): string {
  const message = input['message'];
  if (typeof message === 'string') return message;
  const prompt = input['prompt'];
  if (typeof prompt === 'string') return prompt;
  return JSON.stringify(input);
}

function readString(obj: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!obj) return undefined;
  const value = obj[key];
  return typeof value === 'string' ? value : undefined;
}
