import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';

let app: FastifyInstance;

beforeAll(async () => {
  const server = await buildServer();
  app = server.app;
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

// ---------------------------------------------------------------------------
// GET /healthz
// ---------------------------------------------------------------------------
describe('GET /healthz', () => {
  it('returns 200 with status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/capabilities
// ---------------------------------------------------------------------------
describe('GET /api/v1/capabilities', () => {
  it('returns capabilities object', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/capabilities' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('durableCheckpoints');
    expect(body).toHaveProperty('humanInTheLoop');
    expect(body).toHaveProperty('streaming');
    expect(body).toHaveProperty('artifactEmission');
    expect(body).toHaveProperty('cancellation');
    expect(body).toHaveProperty('resumability');
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/chat — validation
// ---------------------------------------------------------------------------
describe('POST /api/v1/chat', () => {
  it('returns 400 when userMessage is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { conversationId: 'c1', agentId: 'a1', workspaceId: 'w1' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty('error', 'Validation failed');
  });

  it('returns 400 when conversationId is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { userMessage: 'hello', agentId: 'a1', workspaceId: 'w1' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty('error', 'Validation failed');
  });

  it('returns 400 when agentId is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { userMessage: 'hello', conversationId: 'c1', workspaceId: 'w1' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty('error', 'Validation failed');
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/chat/action — validation
// ---------------------------------------------------------------------------
describe('POST /api/v1/chat/action', () => {
  it('returns 400 when actionType is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/action',
      payload: {
        actionPayload: {},
        conversationId: 'c1',
        agentId: 'a1',
        workspaceId: 'w1',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty('error', 'Validation failed');
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/runs — validation
// ---------------------------------------------------------------------------
describe('POST /api/v1/runs', () => {
  it('returns 400 when agentId is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/runs',
      payload: { workspaceId: 'w1', input: {} },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty('error', 'Validation failed');
  });

  it('returns 201 with full contract payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/runs',
      payload: {
        agentId: 'a1',
        workspaceId: 'w1',
        input: { message: 'hello' },
        config: { graphId: 'custom-graph' },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.runId).toBeDefined();
    expect(body.status).toBe('running');
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/runs/:runId/artifacts — validation
// ---------------------------------------------------------------------------
describe('POST /api/v1/runs/:runId/artifacts', () => {
  it('returns 400 when mimeType is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/runs/run-123/artifacts',
      payload: { type: 'file', name: 'a.pdf' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty('error', 'Validation failed');
  });
});
