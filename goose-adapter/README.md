# `@urule/goose-adapter` (spike)

Goose orchestrator adapter for Urule. Implements `OrchestratorAdapter` from [`@urule/orchestrator-contract`](../urule-orchestrator-contract) so Goose recipes can run inside Urule workspaces alongside LangGraph agents.

**Status: spike.** The adapter shape, contract compliance, and HTTP surface are real. The actual wire protocol to a running Goose daemon is stubbed behind a `GooseClient` interface — see "What's stubbed" below.

## Why this exists

Goose is an agent harness (peer of LangGraph, CrewAI). Urule is the control plane above harnesses. This adapter is the seam that lets Urule host Goose recipes while keeping governance, approvals, channels, and packages at the Urule layer. See the top-level [README](../README.md#where-urule-sits) for the layering.

This adapter is also Urule's **first** contract-compliant orchestrator implementation — it consumes `@urule/orchestrator-contract` directly and passes its shared compliance suite. The existing [`urule-langgraph-adapter`](../urule-langgraph-adapter) uses inline types and is scheduled to migrate.

## Layout

```
src/
├── adapter/goose-adapter.ts   OrchestratorAdapter impl; translates Urule runs <-> Goose sessions
├── goose/goose-client.ts      GooseClient interface + InMemoryGooseClient (dev/test default)
├── routes/runs.routes.ts      Fastify HTTP surface (POST /runs, pause/resume/cancel, artifacts)
├── config.ts                  Env loading (PORT, GOOSE_DAEMON_URL, ...)
├── server.ts                  buildServer() — composes adapter + client + routes
└── index.ts                   Entry point
tests/
├── adapter.compliance.test.ts Runs @urule/orchestrator-contract compliance suite (7 tests)
├── adapter.test.ts            Goose-specific behavior (param forwarding, approval bookkeeping)
└── routes.test.ts             HTTP round-trips via app.inject
```

## What's stubbed

The `GooseClient` interface in [src/goose/goose-client.ts](src/goose/goose-client.ts) defines the minimal surface needed from Goose: `startSession`, `pause/resume/cancelSession`, `getSessionState`. The spike ships `InMemoryGooseClient` — sufficient to prove the contract mapping and exercise the HTTP surface, but it does not talk to a real Goose process.

**Before this is production-viable, someone needs to:**

1. Confirm Goose's actual daemon/headless protocol. Goose markets "desktop app, CLI, and API" and is partially organized around the Agent Client Protocol (ACP), but the public README does not specify an endpoint shape. Primary sources to consult:
   - `goose-docs.ai/docs/` (official docs site)
   - The `crates/` tree of the [goose repo](https://github.com/aaif-goose/goose) for daemon source
   - Goose's `CUSTOM_DISTROS.md` for runtime configuration
2. Implement `HttpGooseClient` (or `AcpGooseClient`) against that protocol and wire it up in [src/server.ts](src/server.ts) in place of `InMemoryGooseClient`.
3. Decide how streaming output reaches Urule's office-ui. The langgraph-adapter uses a Fastify WebSocket with a `broadcast()` callback — this adapter can follow the same pattern once the wire protocol is known.

Everything up to that seam — contract compliance, HTTP routes, approval bookkeeping, Urule-side artifact tracking — works today.

## Contract mapping

| Urule contract                                   | Goose concept                                    |
| ------------------------------------------------ | ------------------------------------------------ |
| `StartRunParams.agentId`                         | Local bookkeeping (Goose has no agent registry)  |
| `StartRunParams.workspaceId`                     | Local bookkeeping                                |
| `StartRunParams.input.message` / `.prompt`       | Goose session initial input                      |
| `StartRunParams.config.recipe` / `.recipePath`   | Goose recipe to load                             |
| `StartRunParams.config.model` / `.provider`      | Goose model + provider selection                 |
| `StartRunParams.mcpBindings`                     | Goose extensions (MCP)                           |
| `pauseForApproval(runId, approval)`              | `pauseSession` + track `pendingApprovals` in-adapter |
| `resumeRun(runId, input)`                        | `resumeSession(input.data.message?)`             |
| `cancelRun(runId, reason)`                       | `cancelSession`                                  |
| `getState(runId)`                                | `getSessionState` + adapter-side artifacts/approvals |
| `emitArtifact(runId, artifact)`                  | Adapter-local (Goose has no named artifact API today) |
| `handoffAgent(runId, params)`                    | **Not supported yet** — no-op placeholder        |

Urule's approval model (`pendingApprovals` on `RunState`) lives in the adapter, not Goose. Goose knows the session is paused; Urule knows *why*.

## Capabilities

```ts
{
  durableCheckpoints: false,   // Goose does not persist session state across daemon restarts
  humanInTheLoop: true,        // via pause/resume
  subgraphs: true,             // Goose subrecipes
  streaming: true,             // Goose daemon streams output (when wired)
  artifactEmission: true,      // adapter-local
  cancellation: true,
  resumability: true,
}
```

## Running it

```bash
npm install
npm run typecheck
npm test
npm run dev     # starts on PORT=3000 by default
```

### HTTP surface

```
GET    /healthz
GET    /api/v1/capabilities
POST   /api/v1/runs                      StartRunParams
GET    /api/v1/runs/:runId/state
POST   /api/v1/runs/:runId/pause         ApprovalRequest
POST   /api/v1/runs/:runId/resume        ResumeInput
DELETE /api/v1/runs/:runId               { reason }
POST   /api/v1/runs/:runId/artifacts     Artifact
```

### Example: start a run

```bash
curl -X POST http://localhost:3000/api/v1/runs \
  -H 'content-type: application/json' \
  -d '{
    "agentId": "agent-haiku-bot",
    "workspaceId": "ws-demo",
    "input": { "message": "Write a haiku about the control plane." },
    "config": { "recipe": "poet.yaml", "model": "claude-opus-4-7", "provider": "anthropic" },
    "mcpBindings": ["brave-search"]
  }'
```

## Next steps

Tracked in the top-level [ROADMAP](../ROADMAP.md#62-agent-capabilities):

1. **Wire a real `HttpGooseClient`** once Goose's daemon/ACP protocol is confirmed.
2. **Add WebSocket streaming** mirroring the pattern in [urule-langgraph-adapter/src/routes/ws.routes.ts](../urule-langgraph-adapter/src/routes/ws.routes.ts).
3. **Add `goose-recipe` package type** to [`@urule/spec`](../urule-spec) so Goose recipes distribute through Urule's [packagehub](../urule-packagehub).
4. **Re-point langgraph-adapter** to `@urule/orchestrator-contract` for consistency once the contract proves out here.
