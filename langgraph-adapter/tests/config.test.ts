import { describe, it, expect } from 'vitest';
import { loadConfig, validateConfig } from '../src/config.js';

describe('langgraph-adapter — config validation (fail-fast)', () => {
  it('throws when NATS_URL is missing', () => {
    const origNats = process.env['NATS_URL'];
    const origRegistry = process.env['REGISTRY_URL'];
    delete process.env['NATS_URL'];
    process.env['REGISTRY_URL'] = 'http://registry.example:3001';
    try {
      const cfg = loadConfig();
      expect(() => validateConfig(cfg)).toThrowError(/NATS_URL/);
    } finally {
      if (origNats !== undefined) process.env['NATS_URL'] = origNats;
      if (origRegistry !== undefined) process.env['REGISTRY_URL'] = origRegistry;
      else delete process.env['REGISTRY_URL'];
    }
  });

  it('throws when REGISTRY_URL is missing', () => {
    const origNats = process.env['NATS_URL'];
    const origRegistry = process.env['REGISTRY_URL'];
    process.env['NATS_URL'] = 'nats://example:4222';
    delete process.env['REGISTRY_URL'];
    try {
      const cfg = loadConfig();
      expect(() => validateConfig(cfg)).toThrowError(/REGISTRY_URL/);
    } finally {
      if (origNats !== undefined) process.env['NATS_URL'] = origNats;
      else delete process.env['NATS_URL'];
      if (origRegistry !== undefined) process.env['REGISTRY_URL'] = origRegistry;
    }
  });

  it('does not throw when both required vars are set', () => {
    const origNats = process.env['NATS_URL'];
    const origRegistry = process.env['REGISTRY_URL'];
    process.env['NATS_URL'] = 'nats://example:4222';
    process.env['REGISTRY_URL'] = 'http://registry.example:3001';
    try {
      const cfg = loadConfig();
      expect(() => validateConfig(cfg)).not.toThrow();
    } finally {
      if (origNats !== undefined) process.env['NATS_URL'] = origNats;
      else delete process.env['NATS_URL'];
      if (origRegistry !== undefined) process.env['REGISTRY_URL'] = origRegistry;
      else delete process.env['REGISTRY_URL'];
    }
  });
});
