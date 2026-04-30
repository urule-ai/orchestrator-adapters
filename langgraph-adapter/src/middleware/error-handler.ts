import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export interface UruleError {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

// Redaction patterns. Order matters: most-specific tokens first so they
// don't get partially eaten by broader rules.
const ANTHROPIC_KEY_RE = /sk-ant-[A-Za-z0-9_-]+/g;
const OPENAI_KEY_RE = /sk-[A-Za-z0-9_-]{20,}/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._\-+/=]+/gi;
const AUTH_HEADER_RE = /authorization\s*[:=]\s*(?:"[^"]*"|'[^']*'|\S+)/gi;
const X_API_KEY_HEADER_RE = /x-api-key\s*[:=]\s*(?:"[^"]*"|'[^']*'|\S+)/gi;
const QUERY_API_KEY_RE = /([?&](?:api[_-]?key|access[_-]?token|token))=[^&\s"']+/gi;
const REDACTED = '[REDACTED]';

export function redactSecrets(input: string): string {
  return input
    .replace(ANTHROPIC_KEY_RE, REDACTED)
    .replace(OPENAI_KEY_RE, REDACTED)
    .replace(BEARER_RE, `Bearer ${REDACTED}`)
    .replace(AUTH_HEADER_RE, `authorization: ${REDACTED}`)
    .replace(X_API_KEY_HEADER_RE, `x-api-key: ${REDACTED}`)
    .replace(QUERY_API_KEY_RE, `$1=${REDACTED}`);
}

/**
 * Returns a copy of `error` with `message` and `stack` redacted, suitable for
 * logging. Other fields (statusCode, code, name) pass through unchanged.
 */
function redactedErrorForLog(error: FastifyError): Record<string, unknown> {
  return {
    name: error.name,
    code: error.code,
    statusCode: error.statusCode,
    message: redactSecrets(error.message ?? ''),
    stack: error.stack ? redactSecrets(error.stack) : undefined,
  };
}

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  // Redact BEFORE logging — pino serializers run later but the raw message
  // is what tail-of-line viewers (kubectl logs, journalctl, etc.) see.
  request.log.error(
    { err: redactedErrorForLog(error), requestId: request.id },
    'Request error',
  );

  const statusCode = error.statusCode ?? 500;
  const safeMessage = redactSecrets(error.message ?? 'Internal Server Error');
  const response: UruleError = {
    error: {
      code: error.code ?? 'INTERNAL_ERROR',
      message: safeMessage,
      requestId: request.id,
    },
  };

  reply.status(statusCode).send(response);
}
