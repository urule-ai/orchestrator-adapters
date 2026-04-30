import { describe, it, expect } from 'vitest';
import { runComplianceSuite } from '@urule/orchestrator-contract/testing';
import { GooseAdapter } from '../src/adapter/goose-adapter.js';
import { InMemoryGooseClient } from '../src/goose/goose-client.js';

runComplianceSuite(() => new GooseAdapter(new InMemoryGooseClient()), {
  describe,
  it,
  expect: expect as unknown as Parameters<typeof runComplianceSuite>[1]['expect'],
});
