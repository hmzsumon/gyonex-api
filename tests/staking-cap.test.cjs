require('ts-node/register/transpile-only');
const assert = require('node:assert/strict');
const {stakingCancellationDeadline,stakingProfitCap,cancellationAmounts}=require('../src/utils/stakingPolicy');
assert.equal(stakingProfitCap(50),125);
assert.equal(stakingProfitCap(10000),25000);
assert.equal(stakingProfitCap(10001),35003.5);
assert.equal(stakingCancellationDeadline(new Date('2026-01-31T10:00:00+06:00')).toISOString(),'2026-02-28T04:00:00.000Z');
assert.deepEqual(cancellationAmounts(100,10),{penaltyQty:10,returnQty:90});
console.log('Staking cap, calendar month, and cancellation fee checks passed.');
