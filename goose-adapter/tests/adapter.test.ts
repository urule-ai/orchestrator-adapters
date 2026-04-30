import { describe, it, expect, beforeEach } from 'vitest';
import { GooseAdapter } from '../src/adapter/goose-adapter.js';
import { InMemoryGooseClient, type GooseStartParams } from '../src/goose/goose-client.js';

describe('GooseAdapter', () => {
  let client: InMemoryGooseClient;
  let adapter: GooseAdapter;

  beforeEach(() => {
    client = new InMemoryGooseClient();
    adapter = new GooseAdapter(client);
  });

  it('forwards StartRunParams.config to the Goose client', async () => {
    let captured: GooseStartParams | undefined;
    const original = client.startSession.bind(client);
    client.startSession = async (params) => {
      captured = params;
      return original(params);
    };

    await adapter.startRun({
      agentId: 'agent-1',
      workspaceId: 'ws-1',
      input: { message: 'write a haiku' },
      mcpBindings: ['brave-search'],
      config: { recipe: 'poet.yaml', model: 'claude-opus-4-7', provider: 'anthropic' },
    });

    expect(captured?.recipe).toBe('poet.yaml');
    expect(captured?.model).toBe('claude-opus-4-7');
    expect(captured?.provider).toBe('anthropic');
    expect(captured?.extensions).toEqual(['brave-search']);
    expect(captured?.initialInput).toBe('write a haiku');
  });

  it('reflects Goose session completion in RunState', async () => {
    const handle = await adapter.startRun({
      agentId: 'agent-1',
      workspaceId: 'ws-1',
      input: { message: 'hello' },
    });

    const [sessionId] = client.sessionIds();
    if (!sessionId) throw new Error('expected one Goose session');
    client.completeSession(sessionId, 'done');

    const state = await adapter.getState(handle.runId);
    expect(state.status).toBe('completed');
    expect(state.output).toEqual({ text: 'done' });
  });

  it('falls back to JSON.stringify for non-string input', async () => {
    let captured: GooseStartParams | undefined;
    const original = client.startSession.bind(client);
    client.startSession = async (params) => {
      captured = params;
      return original(params);
    };

    await adapter.startRun({
      agentId: 'agent-1',
      workspaceId: 'ws-1',
      input: { task: 'review', files: ['a.ts', 'b.ts'] },
    });

    expect(captured?.initialInput).toBe('{"task":"review","files":["a.ts","b.ts"]}');
  });

  it('tracks and clears pending approvals across pause/resume', async () => {
    const handle = await adapter.startRun({
      agentId: 'agent-1',
      workspaceId: 'ws-1',
      input: {},
    });

    await adapter.pauseForApproval(handle.runId, {
      title: 'Approve',
      description: 'Test',
      action: 'x',
      context: {},
    });
    const paused = await adapter.getState(handle.runId);
    expect(paused.status).toBe('paused');
    expect(paused.pendingApprovals).toHaveLength(1);

    await adapter.resumeRun(handle.runId, { decision: 'approve' });
    const resumed = await adapter.getState(handle.runId);
    expect(resumed.status).toBe('running');
    expect(resumed.pendingApprovals).toHaveLength(0);
  });

  it('throws on unknown runId', async () => {
    await expect(adapter.getState('nonexistent')).rejects.toThrow('Run not found');
  });

  it('reports expected capabilities', () => {
    const caps = adapter.getCapabilities();
    expect(caps.humanInTheLoop).toBe(true);
    expect(caps.cancellation).toBe(true);
    expect(caps.streaming).toBe(true);
    expect(caps.durableCheckpoints).toBe(false);
  });
});
