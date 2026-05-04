// initOtel must run BEFORE Fastify is loaded so auto-instrumentation can hook
// it at module-load time. Static imports are hoisted; we keep only the OTel
// helper imported statically here and dynamically import everything else.
import { initOtel } from '@urule/observability';

const otelSdk = initOtel('langgraph-adapter');

const { loadConfig, validateConfig } = await import('./config.js');
const { buildServer } = await import('./server.js');
const { closeAllConnections } = await import('./routes/ws.routes.js');

const loadedConfig = loadConfig();
validateConfig(loadedConfig);
const { app, config } = await buildServer();

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

const shutdown = async () => {
  app.log.info('Shutting down...');
  const closed = closeAllConnections();
  if (closed > 0) {
    app.log.info({ closed }, 'Closed active WebSocket connections');
  }
  await app.close();
  if (otelSdk) await otelSdk.shutdown();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
