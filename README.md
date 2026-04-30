# Urule Orchestrator Adapters

Implementations of [`@urule/orchestrator-contract`](https://github.com/urule-ai/orchestrator-contract) for popular AI agent orchestration runtimes. Each adapter wraps a third-party orchestrator behind the contract interface and exposes it as a Fastify HTTP service.

## Adapters

| Package | Wraps | Status |
|---|---|---|
| [`@urule/langgraph-adapter`](./langgraph-adapter) | LangGraph + Anthropic Claude (with WebSocket streaming) | Production |
| [`@urule/goose-adapter`](./goose-adapter) | Goose daemon / Agent Client Protocol | Spike (`0.1.0-spike.0`) |

Planned (see Urule [ROADMAP §6.2](https://github.com/urule-ai/urule/blob/main/ROADMAP.md)): CrewAI, AutoGen, ADK.

## Why a single repo?

- One PR can update the contract import paths and every adapter that implements it.
- Shared tooling (`tsconfig.base.json`, `.eslintrc.json`, `.prettierrc`, CI) — no duplication across N adapter repos.
- Compliance-suite drift gets caught everywhere at once: each adapter runs `runComplianceSuite()` from `@urule/orchestrator-contract/testing`.
- The contract itself stays in [`urule-ai/orchestrator-contract`](https://github.com/urule-ai/orchestrator-contract) — small, stable, no adapter-specific deps in its release.

## Layout

```
orchestrator-adapters/
├── package.json               # npm workspaces config
├── tsconfig.base.json         # shared compiler options
├── .eslintrc.json
├── .prettierrc
├── goose-adapter/             # @urule/goose-adapter
└── langgraph-adapter/         # @urule/langgraph-adapter
```

## Development

```bash
# From the repo root:
npm install                    # installs all workspaces
npm run typecheck:all          # tsc --noEmit in every adapter
npm run test:all               # vitest run in every adapter
npm run build:all              # tsc in every adapter
```

Per-adapter:

```bash
cd langgraph-adapter
npm test
npm run dev                    # tsx watch
```

## Adding a new adapter

1. Create a new directory at the repo root (e.g. `crewai-adapter/`).
2. `package.json` named `@urule/<x>-adapter`, depending on `@urule/orchestrator-contract` (and `@urule/auth-middleware` if exposed via HTTP).
3. Implement `OrchestratorAdapter` in `src/adapter/<x>-adapter.ts`.
4. Add a Fastify server in `src/server.ts` and routes in `src/routes/`.
5. Run the contract's compliance suite from `tests/adapter.compliance.test.ts`:
   ```ts
   import { runComplianceSuite } from '@urule/orchestrator-contract/testing';
   runComplianceSuite(() => new MyAdapter(...), { ... });
   ```
6. Add the directory to `workspaces` in the root `package.json`.

## License

Apache-2.0
