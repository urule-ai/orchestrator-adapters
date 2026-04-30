import { describe, it, expect, beforeEach } from 'vitest';
import { LangGraphAdapter } from '../src/adapter/langgraph-adapter.js';

describe('LangGraphAdapter', () => {
  let adapter: LangGraphAdapter;

  beforeEach(() => {
    adapter = new LangGraphAdapter('http://localhost:8123');
  });

  it('should start a run and return a running handle', async () => {
    const handle = await adapter.startRun({
      agentId: 'agent-1',
      workspaceId: 'ws-1',
      input: { message: 'hello' },
    });

    expect(handle.runId).toBeDefined();
    expect(handle.status).toBe('running');
  });

  it('should forward config.graphId to internal state', async () => {
    const handle = await adapter.startRun({
      agentId: 'agent-1',
      workspaceId: 'ws-1',
      input: {},
      config: { graphId: 'custom-graph' },
    });
    // graphId is not exposed on RunState by the contract; it's adapter-internal.
    // Smoke test: run starts successfully with graphId config.
    const state = await adapter.getState(handle.runId);
    expect(state.status).toBe('running');
  });

  it('should support the full lifecycle: start -> pause -> resume', async () => {
    const handle = await adapter.startRun({
      agentId: 'agent-1',
      workspaceId: 'ws-1',
      input: { task: 'review PR' },
    });

    await adapter.pauseForApproval(handle.runId, {
      title: 'Approve',
      description: 'Agent wants to merge',
      action: 'merge-pr',
      context: {},
    });
    let state = await adapter.getState(handle.runId);
    expect(state.status).toBe('paused');
    expect(state.pendingApprovals.length).toBe(1);

    await adapter.resumeRun(handle.runId, { decision: 'approve' });
    state = await adapter.getState(handle.runId);
    expect(state.status).toBe('running');
    expect(state.pendingApprovals.length).toBe(0);
  });

  it('should cancel a running run with a reason', async () => {
    const handle = await adapter.startRun({
      agentId: 'agent-1',
      workspaceId: 'ws-1',
      input: { task: 'deploy' },
    });

    await adapter.cancelRun(handle.runId, 'user requested');
    const state = await adapter.getState(handle.runId);
    expect(state.status).toBe('cancelled');
    expect(state.completedAt).toBeDefined();
  });

  it('should emit and track artifacts with generated ids', async () => {
    const handle = await adapter.startRun({
      agentId: 'agent-1',
      workspaceId: 'ws-1',
      input: { task: 'generate report' },
    });

    await adapter.emitArtifact(handle.runId, {
      type: 'report',
      name: 'report.pdf',
      mimeType: 'application/pdf',
    });

    const state = await adapter.getState(handle.runId);
    expect(state.artifacts).toHaveLength(1);
    expect(state.artifacts[0]?.id).toBeDefined();
    expect(state.artifacts[0]?.type).toBe('report');
    expect(state.artifacts[0]?.name).toBe('report.pdf');
  });

  it('should throw for unknown runId', async () => {
    await expect(adapter.getState('nonexistent')).rejects.toThrow('Run not found: nonexistent');
  });

  it('should report full capabilities', () => {
    const caps = adapter.getCapabilities();
    expect(caps).toEqual({
      durableCheckpoints: true,
      humanInTheLoop: true,
      subgraphs: true,
      streaming: true,
      artifactEmission: true,
      cancellation: true,
      resumability: true,
    });
  });

  it('should accumulate multiple artifacts', async () => {
    const handle = await adapter.startRun({
      agentId: 'agent-1',
      workspaceId: 'ws-1',
      input: {},
    });

    await adapter.emitArtifact(handle.runId, {
      type: 'log',
      name: 'run.log',
      mimeType: 'text/plain',
    });
    await adapter.emitArtifact(handle.runId, {
      type: 'screenshot',
      name: 'screen.png',
      mimeType: 'image/png',
    });

    const state = await adapter.getState(handle.runId);
    expect(state.artifacts).toHaveLength(2);
  });

  it('should not throw on handoffAgent for a valid run', async () => {
    const handle = await adapter.startRun({
      agentId: 'agent-1',
      workspaceId: 'ws-1',
      input: {},
    });

    await expect(
      adapter.handoffAgent(handle.runId, {
        targetAgentId: 'agent-xyz',
        context: {},
        reason: 'delegation',
      }),
    ).resolves.toBeUndefined();
  });
});
