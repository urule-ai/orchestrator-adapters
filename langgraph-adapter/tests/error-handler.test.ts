import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { redactSecrets, errorHandler } from '../src/middleware/error-handler.js';

describe('redactSecrets', () => {
  it('strips Anthropic API keys', () => {
    const out = redactSecrets('auth failed for key sk-ant-api03-abc123_DEF-456 calling Claude');
    expect(out).not.toContain('sk-ant-');
    expect(out).toContain('[REDACTED]');
  });

  it('strips OpenAI-style sk-... keys', () => {
    const out = redactSecrets('upstream returned 401 for key sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ012345');
    expect(out).not.toContain('sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ012345');
    expect(out).toContain('[REDACTED]');
  });

  it('strips Bearer tokens', () => {
    const out = redactSecrets('upstream rejected request with header Bearer eyJhbGciOiJSUzI1NiJ9.foo.bar');
    expect(out).not.toContain('eyJhbGciOiJSUzI1NiJ9');
    expect(out).toMatch(/Bearer\s+\[REDACTED\]/);
  });

  it('strips authorization header values (quoted)', () => {
    const out = redactSecrets('request failed: authorization: "Basic dXNlcjpwYXNz"');
    expect(out).not.toContain('dXNlcjpwYXNz');
    expect(out.toLowerCase()).toContain('authorization: [redacted]');
  });

  it('strips authorization header values (unquoted)', () => {
    const out = redactSecrets('headers: authorization=Bearer raw-token-here, host=example.com');
    expect(out).not.toContain('raw-token-here');
  });

  it('strips x-api-key header values', () => {
    const out = redactSecrets('upstream sent x-api-key: "0123456789abcdef" headers');
    expect(out).not.toContain('0123456789abcdef');
    expect(out.toLowerCase()).toContain('x-api-key: [redacted]');
  });

  it('strips api_key from query strings', () => {
    const out = redactSecrets('GET https://api.example.com/v1/things?api_key=mySecretToken123 failed');
    expect(out).not.toContain('mySecretToken123');
    expect(out).toContain('api_key=[REDACTED]');
  });

  it('strips access_token from query strings', () => {
    const out = redactSecrets('redirect uri https://x?foo=1&access_token=abcDEF.xyz123 was rejected');
    expect(out).not.toContain('abcDEF.xyz123');
    expect(out).toContain('access_token=[REDACTED]');
  });

  it('passes through messages with no secrets', () => {
    expect(redactSecrets('plain failure')).toBe('plain failure');
  });
});

// ---------------------------------------------------------------------------
// errorHandler (integration)
// ---------------------------------------------------------------------------

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
