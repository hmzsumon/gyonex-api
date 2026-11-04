require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

test('a stalled ledger retry cannot block open TP refreshes', async () => {
  const load = Module._load;
  const originalInterval = global.setInterval;
  const originalClear = global.clearInterval;
  const timers = [];
  let scans = 0, deliveries = 0, release;
  const stalled = new Promise(resolve => { release = resolve; });
  const model = { find(filter) {
    if (filter.status === 'closed') return {
      select() { return this; }, limit() { return this; },
      lean: async () => [{ _id: 'pending' }],
    };
    scans++;
    return { select() { return this; }, lean() { return this; }, exec: async () => [] };
  } };
  Module._load = function(id, ...args) {
    if (id === '@/models/AiPosition.model') return { __esModule: true, default: model };
    if (id === '@/services/autoCloseDistributor.service') return {
      distributeOnAutoCloseSimple: async () => { deliveries++; await stalled; },
    };
    if (id === '@/services/quote.service') return { normalizeSymbol: s => s };
    if (id === '@/services/quoteHub') return { subscribeQuote() {} };
    if (id === '@/services/specs.service') return { getContractSpec() {} };
    return load.call(this, id, ...args);
  };
  global.setInterval = fn => { timers.push(fn); return timers.length; };
  global.clearInterval = () => {};
  let engine;
  try {
    engine = require('../src/services/tpClose.ws.service');
    engine.startTpWsEngine();
    await new Promise(setImmediate);
    assert.equal(deliveries, 1);
    assert.equal(scans, 1);
    for (const tick of timers) tick();
    await new Promise(setImmediate);
    assert.equal(scans, 2, 'open monitoring must refresh while payout is stalled');
    assert.equal(deliveries, 1, 'retry scans must not overlap');
  } finally {
    engine?.stopTpWsEngine();
    release();
    Module._load = load;
    global.setInterval = originalInterval;
    global.clearInterval = originalClear;
  }
});
