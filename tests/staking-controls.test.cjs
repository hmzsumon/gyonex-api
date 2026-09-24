// Run: node tests/staking-controls.test.cjs (also works without child-process permissions).
require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const { stakingDayKey, isStakingProfitDay, cancellationAmounts } = require('../src/utils/stakingPolicy');
const Settings = require('../src/models/StakingSetting.model').default;
const Subs = require('../src/models/StakingSubscription.model').default;
const Logs = require('../src/models/StakingProfitLog.model').default;
const { runStakingProfitJob } = require('../src/crons/stakingProfitJob');
const admin = require('../src/controllers/admin.staking.controller');
const staking = require('../src/controllers/staking.controller');

const restores = [];
function stub(object, key, value) {
  const original = object[key];
  object[key] = value;
  restores.push(() => { object[key] = original; });
}
afterEach(() => { while (restores.length) restores.pop()(); });
function invoke(handler, req = {}) {
  return new Promise((resolve, reject) => {
    const res = { status() { return this; }, json: resolve };
    handler(req, res, reject);
  });
}
const allDays = [0, 1, 2, 3, 4, 5, 6];
const settings = (extra = {}) => ({ stakingEnabled: true, profitEnabled: true,
  cancellationFeePercent: 0, profitDays: allDays, policyHistory: [], ...extra });
const subscription = () => ({ _id: new Types.ObjectId(), userId: new Types.ObjectId(),
  symbol: 'USDT', asset: 'USDT', principalQty: 100, dailyProfitPercent: 2,
  userSharePercent: 0.25, profitTimezone: 'Asia/Dhaka', termDays: 7, paidDays: 1,
  startedAt: new Date('2026-09-20T00:00:00+06:00'),
  endAt: new Date('2026-09-27T00:00:00+06:00'), principalReturned: false });
function mockJob(cfg, sub, paidKeys = []) {
  stub(Settings, 'findOneAndUpdate', async () => cfg);
  stub(Subs, 'find', () => ({ limit: async () => [sub] }));
  stub(Logs, 'find', () => ({ select: () => ({ lean: async () => paidKeys.map(dayKey => ({ dayKey })) }) }));
}

test('weekdays are evaluated at Bangladesh midnight, independent of host timezone', () => {
  const history = [{ effectiveDay: '2026-09-01', profitEnabled: true, profitDays: [5] }];
  assert.equal(stakingDayKey(new Date('2026-09-24T17:59:59Z')), '2026-09-24');
  assert.equal(stakingDayKey(new Date('2026-09-24T18:00:00Z')), '2026-09-25');
  assert.equal(isStakingProfitDay(new Date('2026-09-24T17:59:59Z'), history), false);
  assert.equal(isStakingProfitDay(new Date('2026-09-24T18:00:00Z'), history), true);
});

test('resuming profit does not backfill paused dates or unchecked weekdays', () => {
  const history = [
    { effectiveDay: '2026-09-20', profitEnabled: false, profitDays: allDays },
    { effectiveDay: '2026-09-23', profitEnabled: true, profitDays: [3, 4] },
  ];
  assert.equal(isStakingProfitDay(new Date('2026-09-21T12:00:00+06:00'), history), false);
  assert.equal(isStakingProfitDay(new Date('2026-09-23T12:00:00+06:00'), history), true);
  assert.equal(isStakingProfitDay(new Date('2026-09-25T12:00:00+06:00'), history), false);
});

test('cancellation fees use principal, including zero and 100 percent boundaries', () => {
  assert.deepEqual(cancellationAmounts(100, 10), { penaltyQty: 10, returnQty: 90 });
  assert.deepEqual(cancellationAmounts(100, 0), { penaltyQty: 0, returnQty: 100 });
  assert.deepEqual(cancellationAmounts(100, 100), { penaltyQty: 100, returnQty: 0 });
  assert.deepEqual(cancellationAmounts(0.00001234, 5), { penaltyQty: 0.00000062, returnQty: 0.00001172 });
});

test('job uses selected calendar dates and subscription user-share snapshot', async () => {
  const sub = subscription();
  mockJob(settings({ policyHistory: [{ effectiveDay: '2026-09-20', profitEnabled: true, profitDays: [0, 2, 4] }] }), sub, ['2026-09-20']);
  const out = await runStakingProfitJob({ runAt: new Date('2026-09-24T01:00:00+06:00'), dryRun: true });
  assert.equal(out.profitLogsCreated, 2); // Tuesday and Thursday; Sunday already paid.
  assert.equal(out.userProfitCreditedQty, 1); // 100 * 2% * 25% for each eligible day.
});

test('paused profits still allow maturity principal returns', async () => {
  mockJob(settings({ profitEnabled: false }), subscription());
  const out = await runStakingProfitJob({ runAt: new Date('2026-09-28T01:00:00+06:00'), dryRun: true });
  assert.equal(out.profitLogsCreated, 0);
  assert.equal(out.principalsReturned, 1);
});

test('legacy subscriptions retain existing ledger day keys without duplicate payouts', async () => {
  const sub = subscription();
  delete sub.profitTimezone;
  sub.termDays = 1;
  const date = sub.startedAt;
  const legacyKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  mockJob(settings(), sub, [legacyKey]);
  const out = await runStakingProfitJob({ runAt: new Date('2026-09-24T01:00:00+06:00'), dryRun: true });
  assert.equal(out.profitLogsCreated, 0);
});

test('an unchecked current day makes no profit payment', async () => {
  mockJob(settings({ policyHistory: [{ effectiveDay: '2026-09-20', profitEnabled: true, profitDays: [0] }] }), subscription());
  const out = await runStakingProfitJob({ runAt: new Date('2026-09-24T01:00:00+06:00'), dryRun: true });
  assert.equal(out.profitLogsCreated, 0);
});

test('paused staking rejects new subscriptions before any balance mutation', async () => {
  stub(Settings, 'findOneAndUpdate', async () => settings({ stakingEnabled: false }));
  await assert.rejects(invoke(staking.subscribeStaking, { body: {} }), /Staking is currently paused/);
});

test('admin rejects invalid settings, fees and weekdays', async () => {
  for (const body of [settings({ cancellationFeePercent: -1 }), settings({ cancellationFeePercent: 101 }),
    settings({ profitDays: [7] }), settings({ profitDays: [1.5] }), settings({ profitEnabled: 'false' })]) {
    await assert.rejects(invoke(admin.adminUpdateStakingSettings, { body }), /Provide valid/);
  }
});

test('admin accepts an empty profit week and records its effective policy', async () => {
  const calls = [];
  stub(Settings, 'findOneAndUpdate', async (...args) => { calls.push(args); return settings({ profitDays: [] }); });
  const out = await invoke(admin.adminUpdateStakingSettings, { body: settings({ profitDays: [] }) });
  assert.deepEqual(out.settings.profitDays, []);
  assert.deepEqual(calls[1][1].$push.policyHistory.profitDays, []);
});

test('new package durations and custom user shares are saved', async () => {
  const Plans = require('../src/models/StakingPlan.model').default;
  let saved;
  stub(Plans, 'findOneAndUpdate', async (_filter, update) => { saved = update.$set; return saved; });
  await invoke(admin.adminUpsertStakingPlan, { body: { termDays: 45, dailyProfitPercent: 2, userSharePercent: 0.75, minAmount: 10, isActive: false } });
  assert.equal(saved.totalProfitPercent, 90);
  assert.equal(saved.userSharePercent, 0.75);
  assert.equal(saved.isActive, false);
});

test('loan repayment ignores previously configured extra fees and debits only the payment', async () => {
  const { Loan } = require('../src/models/Loan.model');
  const { User } = require('../src/models/user.model');
  const Wallet = require('../src/models/UserWallet.model').default;
  const LoanSetting = require('../src/models/LoanSetting.model').default;
  const { Notification } = require('../src/models/Notification.model');
  const { AdminNotification } = require('../src/models/AdminNotification.model');
  const TransactionManager = require('../src/utils/TransactionManager').default;
  const { repayLoan, getLoanRepaymentSettings, updateAdminLoanRepaymentSettings } = require('../src/controllers/loan.controller');
  const userId = new Types.ObjectId();
  const loan = { _id: new Types.ObjectId(), totalRepayable: 100, totalPaid: 0, loanType: 'personal', repaymentHistory: [], save: async () => {} };
  const user = { _id: userId, m_balance: 10, role: 'user', save: async () => {} };
  stub(Loan, 'findOne', async () => loan);
  stub(User, 'findById', async () => user);
  stub(Wallet, 'findOneAndUpdate', async () => ({}));
  stub(LoanSetting, 'getSingleton', async () => ({ repaymentFeePercent: 10 }));
  stub(Notification, 'create', async () => ({}));
  stub(AdminNotification, 'create', async () => ({}));
  stub(TransactionManager.prototype, 'createTransaction', async data => { assert.equal(data.amount, 10); return { _id: new Types.ObjectId() }; });
  const out = await invoke(repayLoan, { user: { _id: userId }, params: { loanId: String(loan._id) }, body: { amount: 10 } });
  assert.equal(out.payment.totalCharged, 10);
  assert.equal(out.payment.fee, 0);
  assert.equal(user.m_balance, 0);
  assert.equal(loan.totalPaid, 10);
  assert.equal((await invoke(getLoanRepaymentSettings)).settings.repaymentFeePercent, 0);
  await assert.rejects(invoke(updateAdminLoanRepaymentSettings, { body: { repaymentFeePercent: 10 } }), /fees are disabled/);
});
