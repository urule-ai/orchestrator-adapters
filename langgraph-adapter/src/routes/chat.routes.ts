import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AnthropicExecutor } from '../adapter/anthropic-executor.js';

const sendChatSchema = z.object({
  conversationId: z.string(),
  agentId: z.string(),
  workspaceId: z.string(),
  userMessage: z.string().min(1),
});

const chatActionSchema = z.object({
  actionType: z.string(),
  actionPayload: z.object({}).passthrough(),
  conversationId: z.string(),
  agentId: z.string(),
  workspaceId: z.string(),
});

export async function chatRoutes(
  app: FastifyInstance,
  opts: { executor: AnthropicExecutor },
): Promise<void> {
  const { executor } = opts;

  // Receive a chat message and trigger AI response
  app.post<{
    Body: {
      conversationId: string;
      agentId: string;
      workspaceId: string;
      userMessage: string;
    };
  }>('/api/v1/chat', async (request, reply) => {
    const parsed = sendChatSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }
    const { conversationId, agentId, workspaceId, userMessage } = parsed.data;

    // Fire and forget — the executor will stream via WebSocket
    executor.chat({ conversationId, agentId, workspaceId, userMessage }).catch((err) => {
      app.log.error({ err }, 'Chat execution failed');
    });

    return reply.status(202).send({ status: 'processing', conversationId });
  });

  // Handle inline action button clicks (approve/deny hiring, accept/reject task)
  app.post<{
    Body: {
      actionType: string;
      actionPayload: Record<string, unknown>;
      conversationId: string;
      agentId: string;
      workspaceId: string;
    };
  }>('/api/v1/chat/action', async (request, reply) => {
    const parsed = chatActionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }
    const result = await executor.handleAction(parsed.data as typeof request.body);
    return reply.send(result);
  });
}
