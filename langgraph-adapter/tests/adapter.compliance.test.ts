import { describe, it, expect } from 'vitest';
import { runComplianceSuite } from '@urule/orchestrator-contract/testing';
import { LangGraphAdapter } from '../src/adapter/langgraph-adapter.js';

runComplianceSuite(() => new LangGraphAdapter('http://localhost:8123'), {
  describe,
  it,
  expect: expect as unknown as Parameters<typeof runComplianceSuite>[1]['expect'],
});
