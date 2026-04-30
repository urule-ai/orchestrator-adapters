import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  Artifact,
  LangGraphAdapter,
  ResumeInput,
  StartRunParams,
} from '../adapter/langgraph-adapter.js';

const startRunSchema = z.object({
  agentId: z.string(),
  workspaceId: z.string(),
  input: z.object({}).passthrough(),
  mcpBindings: z.array(z.string()).optional(),
  config: z.object({}).passthrough().optional(),
});

const pauseRunSchema = z
  .object({
    title: z.string(),
    description: z.string(),
    action: z.string(),
    context: z.object({}).passthrough(),
  })
  // Allow empty body for backward compat; default to a minimal approval payload.
  .or(z.object({}).passthrough());

const resumeRunSchema = z
  .object({
    decision: z.enum(['approve', 'reject']).optional(),
    data: z.object({}).passthrough().optional(),
    approvalId: z.string().optional(),
  })
  .or(z.object({}).passthrough());

const emitArtifactSchema = z.object({
  type: z.string(),
  name: z.string(),
  mimeType: z.string(),
  content: z.string().optional(),
  url: z.string().optional(),
  metadata: z.object({}).passthrough().optional(),
});

const cancelRunSchema = z
  .object({ reason: z.string() })
  .or(z.object({}).passthrough());

export async function runsRoutes(
  app: FastifyInstance,
  opts: { adapter: LangGraphAdapter },
): Promise<void> {
  const { adapter } = opts;

  app.post('/api/v1/runs', async (request, reply) => {
    const parsed = startRunSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }
    const handle = await adapter.startRun(parsed.data as StartRunParams);
    return reply.status(201).send(handle);
  });

  app.get<{ Params: { runId: string } }>(
    '/api/v1/runs/:runId/state',
    async (request, reply) => {
      try {
        const state = await adapter.getState(request.params.runId);
        return reply.send(state);
      } catch (err) {
        return reply.status(404).send({ error: (err as Error).message });
      }
    },
  );

  app.post<{ Params: { runId: string } }>(
    '/api/v1/runs/:runId/pause',
    async (request, reply) => {
      const parsed = pauseRunSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Validation failed', details: parsed.error.issues });
      }
      const body = parsed.data as Record<string, unknown>;
      const approval = {
        title: typeof body['title'] === 'string' ? (body['title'] as string) : '',
        description: typeof body['description'] === 'string' ? (body['description'] as string) : '',
        action: typeof body['action'] === 'string' ? (body['action'] as string) : '',
        context: (body['context'] as Record<string, unknown>) ?? {},
      };
      try {
        await adapter.pauseForApproval(request.params.runId, approval);
        return reply.status(204).send();
      } catch (err) {
        return reply.status(404).send({ error: (err as Error).message });
      }
    },
  );

  app.post<{ Params: { runId: string } }>(
    '/api/v1/runs/:runId/resume',
    async (request, reply) => {
      const parsed = resumeRunSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Validation failed', details: parsed.error.issues });
      }
      try {
        await adapter.resumeRun(request.params.runId, parsed.data as ResumeInput);
        return reply.status(204).send();
      } catch (err) {
        return reply.status(404).send({ error: (err as Error).message });
      }
    },
  );

  app.delete<{ Params: { runId: string } }>(
    '/api/v1/runs/:runId',
    async (request, reply) => {
      const parsed = cancelRunSchema.safeParse(request.body ?? {});
      const body = parsed.success ? (parsed.data as Record<string, unknown>) : {};
      const reason = typeof body['reason'] === 'string' ? (body['reason'] as string) : 'cancelled';
      try {
        await adapter.cancelRun(request.params.runId, reason);
        return reply.status(204).send();
      } catch (err) {
        return reply.status(404).send({ error: (err as Error).message });
      }
    },
  );

  app.post<{ Params: { runId: string }; Body: Artifact }>(
    '/api/v1/runs/:runId/artifacts',
    async (request, reply) => {
      const parsed = emitArtifactSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Validation failed', details: parsed.error.issues });
      }
      try {
        await adapter.emitArtifact(request.params.runId, parsed.data as Artifact);
        return reply.status(201).send();
      } catch (err) {
        return reply.status(404).send({ error: (err as Error).message });
      }
    },
  );
}
