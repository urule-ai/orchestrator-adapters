import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { LangGraphAdapter, StartRunParams, ArtifactRef } from '../adapter/langgraph-adapter.js';

const startRunSchema = z.object({
  graphId: z.string().optional(),
  input: z.object({}).passthrough(),
  metadata: z.object({}).passthrough().optional(),
});

const emitArtifactSchema = z.object({
  artifactId: z.string().optional(),
  type: z.string(),
  uri: z.string(),
});

export async function runsRoutes(
  app: FastifyInstance,
  opts: { adapter: LangGraphAdapter },
): Promise<void> {
  const { adapter } = opts;

  // Start a new run
  app.post<{ Body: StartRunParams }>('/api/v1/runs', async (request, reply) => {
    const parsed = startRunSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }
    const handle = await adapter.startRun(parsed.data as StartRunParams);
    return reply.status(201).send(handle);
  });

  // Get run state
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

  // Pause run (human-in-the-loop approval)
  app.post<{ Params: { runId: string } }>(
    '/api/v1/runs/:runId/pause',
    async (request, reply) => {
      try {
        await adapter.pauseForApproval(request.params.runId);
        return reply.status(204).send();
      } catch (err) {
        return reply.status(404).send({ error: (err as Error).message });
      }
    },
  );

  // Resume run
  app.post<{ Params: { runId: string } }>(
    '/api/v1/runs/:runId/resume',
    async (request, reply) => {
      try {
        await adapter.resumeRun(request.params.runId);
        return reply.status(204).send();
      } catch (err) {
        return reply.status(404).send({ error: (err as Error).message });
      }
    },
  );

  // Cancel run
  app.delete<{ Params: { runId: string } }>(
    '/api/v1/runs/:runId',
    async (request, reply) => {
      try {
        await adapter.cancelRun(request.params.runId);
        return reply.status(204).send();
      } catch (err) {
        return reply.status(404).send({ error: (err as Error).message });
      }
    },
  );

  // Emit artifact for a run
  app.post<{ Params: { runId: string }; Body: ArtifactRef }>(
    '/api/v1/runs/:runId/artifacts',
    async (request, reply) => {
      const parsed = emitArtifactSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Validation failed', details: parsed.error.issues });
      }
      try {
        await adapter.emitArtifact(request.params.runId, parsed.data as ArtifactRef);
        return reply.status(201).send();
      } catch (err) {
        return reply.status(404).send({ error: (err as Error).message });
      }
    },
  );
}
