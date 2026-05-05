import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import type { BroadcastFn } from '../adapter/anthropic-executor.js';

// Map of conversationId → set of connected WebSocket clients.
const connectionMap = new Map<string, Set<WebSocket>>();

// Map of workspaceId → set of connected WebSocket clients. Used by the
// approval-event subscriber to push notifications to every client in
// a workspace; keyed independently from the conversation map so a tab
// listening for chat streams doesn't get approval pushes (and vice
// versa).
const workspaceConnectionMap = new Map<string, Set<WebSocket>>();

/**
 * Broadcast an event to all WebSocket clients connected to a conversation.
 */
export const broadcast: BroadcastFn = (conversationId: string, event: Record<string, unknown>) => {
  const sockets = connectionMap.get(conversationId);
  if (!sockets) return;

  const payload = JSON.stringify(event);
  for (const ws of sockets) {
    if (ws.readyState === 1) {
      // WebSocket.OPEN
      ws.send(payload);
    }
  }
};

/**
 * Broadcast an event to every WebSocket client subscribed to `workspaceId`.
 * Used by the approval-event NATS subscriber to push real-time updates
 * to office-ui's notification center.
 */
export function broadcastToWorkspace(workspaceId: string, event: Record<string, unknown>): void {
  const sockets = workspaceConnectionMap.get(workspaceId);
  if (!sockets) return;
  const payload = JSON.stringify(event);
  for (const ws of sockets) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

/**
 * Close every active WebSocket connection with a clean 1001 ("going away")
 * frame. Called from the SIGTERM/SIGINT handler before `app.close()` so
 * clients see an immediate disconnect rather than waiting for a TCP timeout.
 */
export function closeAllConnections(reason = 'Server shutting down'): number {
  let closed = 0;
  for (const map of [connectionMap, workspaceConnectionMap]) {
    for (const sockets of map.values()) {
      for (const ws of sockets) {
        if (ws.readyState === 1) {
          ws.close(1001, reason);
          closed += 1;
        }
      }
    }
    map.clear();
  }
  return closed;
}

export async function wsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { conversationId: string } }>(
    '/api/v1/ws/conversations/:conversationId',
    { websocket: true },
    (socket, request) => {
      const { conversationId } = request.params;

      // Register connection
      if (!connectionMap.has(conversationId)) {
        connectionMap.set(conversationId, new Set());
      }
      connectionMap.get(conversationId)!.add(socket);

      app.log.info({ conversationId }, 'WebSocket client connected');

      // Handle incoming messages (ping/pong, etc.)
      socket.on('message', (data: { toString(): string }) => {
        try {
          const msg = JSON.parse(data.toString()) as { type?: string };
          if (msg.type === 'ping') {
            socket.send(JSON.stringify({ type: 'pong' }));
          }
        } catch {
          // Ignore parse errors
        }
      });

      // Clean up on disconnect
      socket.on('close', () => {
        const sockets = connectionMap.get(conversationId);
        if (sockets) {
          sockets.delete(socket);
          if (sockets.size === 0) {
            connectionMap.delete(conversationId);
          }
        }
        app.log.info({ conversationId }, 'WebSocket client disconnected');
      });
    },
  );

  /**
   * Workspace-scoped firehose. Approval events (and any future
   * workspace-wide notification) are broadcast here. Conversation
   * channels stay separate so a chat-listening tab doesn't receive
   * approval pushes meant for the notification center.
   */
  app.get<{ Params: { workspaceId: string } }>(
    '/api/v1/ws/workspaces/:workspaceId',
    { websocket: true },
    (socket, request) => {
      const { workspaceId } = request.params;

      if (!workspaceConnectionMap.has(workspaceId)) {
        workspaceConnectionMap.set(workspaceId, new Set());
      }
      workspaceConnectionMap.get(workspaceId)!.add(socket);

      app.log.info({ workspaceId }, 'Workspace WebSocket client connected');

      socket.on('message', (data: { toString(): string }) => {
        try {
          const msg = JSON.parse(data.toString()) as { type?: string };
          if (msg.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
        } catch {
          // ignore parse errors
        }
      });

      socket.on('close', () => {
        const sockets = workspaceConnectionMap.get(workspaceId);
        if (sockets) {
          sockets.delete(socket);
          if (sockets.size === 0) workspaceConnectionMap.delete(workspaceId);
        }
        app.log.info({ workspaceId }, 'Workspace WebSocket client disconnected');
      });
    },
  );
}
