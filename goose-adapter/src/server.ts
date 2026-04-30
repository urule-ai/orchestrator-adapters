import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from './config.js';
import { GooseAdapter } from './adapter/goose-adapter.js';
import { InMemoryGooseClient, type GooseClient } from './goose/goose-client.js';
import { runsRoutes } from './routes/runs.routes.js';

export interface BuildServerOpts {
  gooseClient?: GooseClient;
}

export async function buildServer(opts: BuildServerOpts = {}) {
  const config = loadConfig();
  const app = Fastify({
    logger: { level: process.env['LOG_LEVEL'] ?? 'info' },
    genReqId: () => crypto.randomUUID(),
  });

  const allowedOrigins = (process.env['CORS_ORIGINS'] ?? 'http://localhost:3000').split(',');
  await app.register(cors, { origin: allowedOrigins });

  // Spike default: in-memory client. Real daemon wiring lands behind this seam.
  const gooseClient = opts.gooseClient ?? new InMemoryGooseClient();
  const adapter = new GooseAdapter(gooseClient);

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/api/v1/capabilities', async () => adapter.getCapabilities());
  await app.register(runsRoutes, { adapter });

  return { app, config, adapter, gooseClient };
}
