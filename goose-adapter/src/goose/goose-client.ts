import { ulid } from 'ulid';

export type GooseSessionStatus = 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';

export interface GooseSessionHandle {
  sessionId: string;
  status: GooseSessionStatus;
}

export interface GooseSessionState {
  sessionId: string;
  status: GooseSessionStatus;
  startedAt: string;
  completedAt?: string;
  output?: string;
  error?: string;
}

export interface GooseStartParams {
  recipe?: string;
  recipePath?: string;
  initialInput: string;
  model?: string;
  provider?: string;
  extensions?: string[];
}

/**
 * Thin wire-level client for a Goose daemon.
 *
 * Urule's GooseAdapter depends on this interface, not on the underlying
 * transport. Swap the implementation (in-memory for tests, HTTP/ACP for
 * prod) without touching the adapter.
 */
export interface GooseClient {
  startSession(params: GooseStartParams): Promise<GooseSessionHandle>;
  pauseSession(sessionId: string): Promise<void>;
  resumeSession(sessionId: string, input?: string): Promise<void>;
  cancelSession(sessionId: string, reason: string): Promise<void>;
  getSessionState(sessionId: string): Promise<GooseSessionState>;
}

export class InMemoryGooseClient implements GooseClient {
  private readonly sessions = new Map<string, GooseSessionState>();

  async startSession(_params: GooseStartParams): Promise<GooseSessionHandle> {
    const sessionId = `goose-${ulid()}`;
    this.sessions.set(sessionId, {
      sessionId,
      status: 'running',
      startedAt: new Date().toISOString(),
    });
    return { sessionId, status: 'running' };
  }

  async pauseSession(sessionId: string): Promise<void> {
    this.mutate(sessionId, (s) => {
      s.status = 'paused';
    });
  }

  async resumeSession(sessionId: string, _input?: string): Promise<void> {
    this.mutate(sessionId, (s) => {
      s.status = 'running';
    });
  }

  async cancelSession(sessionId: string, _reason: string): Promise<void> {
    this.mutate(sessionId, (s) => {
      s.status = 'cancelled';
      s.completedAt = new Date().toISOString();
    });
  }

  async getSessionState(sessionId: string): Promise<GooseSessionState> {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error(`Goose session not found: ${sessionId}`);
    return { ...state };
  }

  completeSession(sessionId: string, output?: string): void {
    this.mutate(sessionId, (s) => {
      s.status = 'completed';
      s.output = output;
      s.completedAt = new Date().toISOString();
    });
  }

  /** Test helper: enumerate all session ids (insertion order). */
  sessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  private mutate(sessionId: string, fn: (s: GooseSessionState) => void): void {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error(`Goose session not found: ${sessionId}`);
    fn(state);
  }
}
