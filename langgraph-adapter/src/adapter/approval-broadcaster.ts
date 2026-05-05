import { APPROVAL_TOPICS, type EventBus, type UruleEvent } from '@urule/events';
import { broadcastToWorkspace } from '../routes/ws.routes.js';

/**
 * Bridge approval-domain NATS events to per-workspace WebSocket pushes.
 *
 * The approvals service publishes APPROVAL_REQUESTED / DECIDED / ESCALATED
 * with a workspaceId-bearing payload. Office-ui clients subscribed to
 * `/api/v1/ws/workspaces/:wsId` receive a synthesised event of the form:
 *   { type: 'approval', topic: 'urule.approvals.approval.requested', data: <payload> }
 *
 * The notification-center hook in office-ui uses `data.workspaceId` /
 * `data.title` / `data.priority` to produce a toast + history entry, and
 * deep-links via `/office/approvals#:approvalId`.
 *
 * A NATS outage is not fatal: subscriptions silently no-op until the
 * connection comes back; the polling-based approvals page keeps working
 * either way. Returns an unsubscribe handle so the SIGTERM path can
 * tear down cleanly.
 */
interface ApprovalPayload {
  approvalId: string;
  workspaceId?: string;
  status?: string;
  priority?: string;
  riskLevel?: string;
  title?: string;
  action?: string;
  decidedBy?: string;
  decision?: string;
  assignedTo?: string[];
  updatedAt?: string;
  [k: string]: unknown;
}

export interface ApprovalBroadcaster {
  stop(): void;
}

export function startApprovalBroadcaster(eventBus: EventBus): ApprovalBroadcaster {
  const subs = [APPROVAL_TOPICS.APPROVAL_REQUESTED, APPROVAL_TOPICS.APPROVAL_DECIDED, APPROVAL_TOPICS.APPROVAL_ESCALATED]
    .map((topic) =>
      eventBus.subscribe<ApprovalPayload>(topic, async (event: UruleEvent<ApprovalPayload>) => {
        const payload = event.data;
        if (!payload?.workspaceId) return; // Can't route — drop quietly.
        broadcastToWorkspace(payload.workspaceId, {
          type: 'approval',
          topic,
          eventId: event.id,
          correlationId: event.correlationId,
          data: payload,
        });
      }),
    );

  return {
    stop(): void {
      for (const sub of subs) sub.unsubscribe();
    },
  };
}
