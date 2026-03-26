import { loadConfig, validateConfig } from './config.js';
import { buildServer } from './server.js';

async function main() {
  const loadedConfig = loadConfig();
  validateConfig(loadedConfig);
  const { app, config } = await buildServer();

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info('Shutting down...');
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
