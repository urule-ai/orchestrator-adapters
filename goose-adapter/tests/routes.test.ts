import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';

describe('runs routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    ({ app } = await buildServer());
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /healthz returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /api/v1/capabilities returns capability flags', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/capabilities' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.humanInTheLoop).toBe(true);
    expect(body.streaming).toBe(true);
  });

  it('POST /api/v1/runs rejects payload missing agentId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/runs',
      payload: { workspaceId: 'ws-1', input: {} },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/v1/runs creates a run and round-trips through state/cancel', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/runs',
      payload: {
        agentId: 'agent-1',
        workspaceId: 'ws-1',
        input: { message: 'hi' },
        config: { recipe: 'poet.yaml' },
      },
    });
    expect(create.statusCode).toBe(201);
    const { runId, status } = create.json();
    expect(runId).toBeDefined();
    expect(status).toBe('running');

    const state = await app.inject({ method: 'GET', url: `/api/v1/runs/${runId}/state` });
    expect(state.statusCode).toBe(200);
    expect(state.json().status).toBe('running');

    const cancel = await app.inject({
      method: 'DELETE',
      url: `/api/v1/runs/${runId}`,
      payload: { reason: 'user requested' },
    });
    expect(cancel.statusCode).toBe(204);

    const after = await app.inject({ method: 'GET', url: `/api/v1/runs/${runId}/state` });
    expect(after.json().status).toBe('cancelled');
  });

  it('GET /api/v1/runs/:runId/state returns 404 for unknown run', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/runs/unknown/state' });
    expect(res.statusCode).toBe(404);
  });
});
