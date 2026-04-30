import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { errorHandler } from '../src/middleware/error-handler.js';

// redactSecrets itself is unit-tested in @urule/events
// (packages/events/tests/redact-secrets.test.ts). The tests below
// only verify that errorHandler wires it into the response correctly.

describe('errorHandler', () => {
  async function buildAppThatThrows(err: Error & { statusCode?: number; code?: string }) {
    const app = Fastify({ logger: false });
    app.setErrorHandler(errorHandler);
    app.get('/boom', async () => {
      throw err;
    });
    return app;
  }

  it('responds with 500 when the error has no statusCode', async () => {
    const app = await buildAppThatThrows(new Error('something exploded'));
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('something exploded');
    expect(body.error.requestId).toBeDefined();
  });

  it('preserves the error.statusCode and error.code on the response', async () => {
    const err = Object.assign(new Error('not found'), { statusCode: 404, code: 'THING_NOT_FOUND' });
    const app = await buildAppThatThrows(err);
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('THING_NOT_FOUND');
  });

  it('redacts secrets out of the response body before sending', async () => {
    const err = Object.assign(
      new Error('Anthropic call failed for key sk-ant-api03-leaked-secret-123'),
      { statusCode: 502 },
    );
    const app = await buildAppThatThrows(err);
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain('sk-ant-');
    expect(res.body).toContain('[REDACTED]');
  });
});
