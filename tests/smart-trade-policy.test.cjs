require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { smartTradeCap, smartTradePayout, cancellationDeadline } = require('../src/utils/smartTradePolicy');
const { smartAccountView } = require('../src/services/smartTradeLifecycle.service');

test('caps use original trade price, with 10,000 included in the lower tier', () => {
  assert.equal(smartTradeCap(50), 125);
  assert.equal(smartTradeCap(500), 1250);
  assert.equal(smartTradeCap(10000), 25000);
  assert.equal(smartTradeCap(10001), 35003.5);
});
test('only net 60% counts; the final payment is clipped and no later split is payable', () => {
  assert.deepEqual(smartTradePayout(100, 0, 10), { user: 6, parents: 2, company: 2 });
  assert.deepEqual(smartTradePayout(100, 249.7, 10), { user: 0.3, parents: 0.1, company: 0.1 });
  assert.deepEqual(smartTradePayout(100, 250, 10), { user: 0, parents: 0, company: 0 });
});
test('cancellation closes at one calendar month, including shorter months', () => {
  assert.equal(cancellationDeadline(new Date('2026-01-31T10:00:00+06:00')).toISOString(), '2026-02-28T04:00:00.000Z');
  const account = { status: 'active', is_active: true, planPrice: 500, earnedProfit: 0, createdAt: '2026-10-02T10:00:00+06:00' };
  assert.equal(smartAccountView(account, 10, new Date('2026-11-02T09:59:59+06:00')).canCancel, true);
  assert.equal(smartAccountView(account, 10, new Date('2026-11-02T10:00:00+06:00')).canCancel, false);
  assert.equal(smartAccountView({ ...account, status: 'expired' }, 10, new Date('2026-10-03')).canCancel, false);
});

test('net USDT TP uses volume, contract size, side and both commissions', () => {
  const { smartTpPrice } = require('../src/utils/smartTradePolicy');
  const { netPnlAt } = require('../src/utils/takeProfit');
  for (const side of ['buy', 'sell']) {
    const pos = { side, entryPrice: 100, lots: 0.5, contractSize: 2,
      takeProfit: 10, commissionOpen: 1, commissionClose: 2 };
    const closePrice = smartTpPrice(pos);
    assert.equal(closePrice, side === 'buy' ? 113 : 87);
    assert.equal(netPnlAt({ ...pos, closePrice }), 10);
  }
  assert.ok(Number.isNaN(smartTpPrice({ entryPrice: 100, side: 'buy', lots: 0, takeProfit: 10 })));
});
