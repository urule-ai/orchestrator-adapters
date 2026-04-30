export interface Config {
  port: number;
  gooseDaemonUrl: string;
  registryUrl: string;
  natsUrl: string;
}

export function loadConfig(): Config {
  return {
    port: parseInt(process.env['PORT'] ?? '3000', 10),
    gooseDaemonUrl: process.env['GOOSE_DAEMON_URL'] ?? 'http://localhost:8765',
    registryUrl: process.env['REGISTRY_URL'] ?? 'http://localhost:3001',
    natsUrl: process.env['NATS_URL'] ?? 'nats://localhost:4222',
  };
}
