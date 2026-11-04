// Uses only a dedicated local replica set on port 27018, never application DB_URI.
require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const mongoose = require('mongoose');
const assert = require('node:assert/strict');
const Account = require('../src/models/AiAccount.model').default;
const Position = require('../src/models/AiPosition.model').default;
const { User } = require('../src/models/user.model');
const Wallet = require('../src/models/UserWallet.model').default;
const Transaction = require('../src/models/Transaction.model').default;
const { SmartTradeSetting } = require('../src/models/SmartTradeSetting.model');
const { distributeOnAutoCloseSimple } = require('../src/services/autoCloseDistributor.service');
const { syncSmartAccount, hasEligibleSmartAccount } = require('../src/services/smartTradeLifecycle.service');
const { cancelSmartAccount, updateSmartSettings } = require('../src/controllers/smartTrade.controller');
const generationBonus = require('../src/utils/distributeGenarationBonus').default;
const oid = () => new mongoose.Types.ObjectId();
const dbName = 'smart_trade_test_' + Date.now();
let sequence = 100000;
function invoke(handler, req) {
  return new Promise((resolve, reject) => handler(req, { json: resolve, status() { return this; } }, reject));
}
async function user(parents = []) {
  const _id = oid();
  await User.collection.insertOne({ _id, customerId: 'T' + ++sequence, name: 'Test', parents, m_balance: 0, is_active: true });
  await Wallet.collection.insertOne({ userId: _id, customerId: 'T' + sequence, totalAiTradeProfit: 0, totalEarning: 0 });
  return _id;
}
async function account(userId, extra = {}) {
  const _id = oid();
  await Account.collection.insertOne({ _id, userId, customerId: 'TEST', accountNumber: ++sequence,
    plan: 'main', planPrice: 100, balance: 100, equity: 100, role: 'user', mode: 'ai',
    status: 'active', is_active: true, earnedProfit: 0, createdAt: new Date(), ...extra });
  return _id;
}
async function source(adminId, extra = {}) {
  const _id = oid();
  await Position.collection.insertOne({ _id, accountId: adminId, userId: oid(), plan: 'main', symbol: 'BTCUSDT',
    side: 'buy', lots: 1, entryPrice: 100, status: 'closed', takeProfit: 10, pnl: 10, ...extra });
  return _id;
}
async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27018/admin?directConnection=true', { serverSelectionTimeoutMS: 10000 });
  try { await mongoose.connection.db.admin().command({ replSetInitiate: { _id: 'smartTradeTest', members: [{ _id: 0, host: '127.0.0.1:27018' }] } }); }
  catch (error) { if (error.codeName !== 'AlreadyInitialized') throw error; }
  await mongoose.disconnect();
  await mongoose.connect('mongodb://127.0.0.1:27018/' + dbName + '?replicaSet=smartTradeTest', { serverSelectionTimeoutMS: 30000 });
  await Promise.all([Account.init(), Position.init(), SmartTradeSetting.init(), Transaction.init()]);
  await require('../src/models/SystemStats.model').default.create({ companyName: 'Smart Trade Test' });
  const activeParent = await user(), expiredParent = await user();
  await account(activeParent, { plan: 'other' });
  await account(expiredParent, { plan: 'other', earnedProfit: 250, status: 'expired', is_active: false });
  const child = await user([activeParent, expiredParent]);
  const childAccount = await account(child, { earnedProfit: 249.7 });
  const adminAccount = await account(await user(), { role: 'admin' });
  const position = await source(adminAccount);
  const out = await distributeOnAutoCloseSimple(String(position));
  assert.equal(out.usersTotalProfit, 0.3);
  assert.equal((await Account.findById(childAccount)).status, 'expired');
  assert.equal((await User.findById(child)).m_balance, 0.3);
  assert.equal((await User.findById(expiredParent)).m_balance, 0);
  assert.equal(await hasEligibleSmartAccount(child), false);
  assert.equal((await distributeOnAutoCloseSimple(String(position))).skipped, true);
  assert.equal((await User.findById(child)).m_balance, 0.3);
  const noPayout = await source(adminAccount);
  await distributeOnAutoCloseSimple(String(noPayout));
  assert.equal((await User.findById(child)).m_balance, 0.3);
  const fresh = await account(child);
  assert.equal(await hasEligibleSmartAccount(child), true);
  const next = await source(adminAccount);
  await Promise.all([distributeOnAutoCloseSimple(String(next)), distributeOnAutoCloseSimple(String(next))]);
  assert.equal((await Account.findById(fresh)).earnedProfit, 6);
  assert.equal((await User.findById(child)).m_balance, 6.3);
  assert.equal(await Position.countDocuments({ sourcePositionId: next, accountId: fresh }), 1);

  // A ledger error must roll back the counter, wallet, clones, and source guard.
  const failedSource = await source(adminAccount);
  const Manager = require('../src/utils/TransactionManager').default;
  const originalCreate = Manager.prototype.createTransaction;
  Manager.prototype.createTransaction = async () => { throw new Error('simulated ledger failure'); };
  try { await assert.rejects(distributeOnAutoCloseSimple(String(failedSource)), /simulated ledger failure/); }
  finally { Manager.prototype.createTransaction = originalCreate; }
  assert.equal((await Account.findById(fresh)).earnedProfit, 6);
  assert.equal((await User.findById(child)).m_balance, 6.3);
  assert.equal((await Position.findById(failedSource)).distributedAt, undefined);
  assert.equal(await Position.countDocuments({ sourcePositionId: failedSource }), 0);
  await distributeOnAutoCloseSimple(String(failedSource));
  assert.equal((await Account.findById(fresh)).earnedProfit, 12);

  // Historical profit is tied to account ID, never another account in the same plan.
  const legacyUser = await user();
  const legacyId = await account(legacyUser, { plan: 'legacy' });
  await Account.updateOne({ _id: legacyId }, { $unset: { earnedProfit: 1 } });
  await Position.collection.insertOne({ accountId: legacyId, status: 'closed', takeProfit: 500 });
  const legacy = await syncSmartAccount(await Account.findById(legacyId).lean());
  assert.equal(legacy.earnedProfit, 300);
  assert.equal(legacy.status, 'expired');

  // A generation payout cannot qualify a parent with only expired accounts.
  const downline = await user([expiredParent]);
  await generationBonus(downline, 100);
  assert.equal((await User.findById(expiredParent)).m_balance, 0);

  // A newly purchased account restores generation eligibility without reviving the expired one.
  await account(expiredParent, { plan: 'renewed' });
  await distributeOnAutoCloseSimple(String(await source(adminAccount)));
  assert.ok((await User.findById(expiredParent)).m_balance > 0);

  // Configured cancellation fee, one refund despite concurrent requests.
  const cancellingUser = await user();
  const cancellingId = await account(cancellingUser, { plan: 'cancel', planPrice: 500 });
  await invoke(updateSmartSettings, { user: { _id: activeParent }, body: { cancellationFeePercent: 25 } });
  const req = { user: { _id: cancellingUser }, params: { id: String(cancellingId) } };
  const cancellations = await Promise.allSettled([invoke(cancelSmartAccount, req), invoke(cancelSmartAccount, req)]);
  assert.equal(cancellations.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal((await User.findById(cancellingUser)).m_balance, 375);
  assert.equal((await Account.findById(cancellingId)).cancellationFee, 125);
  assert.equal(await Transaction.countDocuments({ userId: cancellingUser, purpose: 'Refund' }), 1);
  const old = await account(cancellingUser, { createdAt: new Date('2020-01-01') });
  await assert.rejects(invoke(cancelSmartAccount, { ...req, params: { id: String(old) } }), /first calendar month/);
  await assert.rejects(invoke(cancelSmartAccount, { user: { _id: activeParent }, params: { id: String(old) } }), /not found/);
  await assert.rejects(invoke(updateSmartSettings, { user: { _id: activeParent }, body: { cancellationFeePercent: 101 } }), /between 0 and 100/);
  // Manual closes pay realized net profit, not the configured TP target.
  const manualUser = await user();
  const manualAccount = await account(manualUser, { plan: 'manual-test' });
  const manualSource = await source(adminAccount, { plan: 'manual-test', closeReason: 'manual', pnl: 4, takeProfit: 50 });
  await distributeOnAutoCloseSimple(String(manualSource));
  assert.equal((await User.findById(manualUser)).m_balance, 2.4);
  assert.equal((await Account.findById(manualAccount)).earnedProfit, 2.4);
  assert.equal((await Position.findOne({ sourcePositionId: manualSource })).userProfitCredited, 2.4);
  await distributeOnAutoCloseSimple(String(manualSource));
  assert.equal((await User.findById(manualUser)).m_balance, 2.4);

  // An individual user's close must never distribute to everyone in the plan.
  const individualSource = await source(manualAccount, { plan: 'manual-test', closeReason: 'manual', pnl: 5, userProfitCredited: 0 });
  const otherUser = await user();
  await account(otherUser, { plan: 'manual-test' });
  await distributeOnAutoCloseSimple(String(individualSource));
  assert.equal((await User.findById(manualUser)).m_balance, 5.4);
  assert.equal((await User.findById(otherUser)).m_balance, 0);
  assert.equal((await Position.findById(individualSource)).userProfitCredited, 3);
  assert.equal(await Position.countDocuments({ sourcePositionId: individualSource }), 0);

  console.log('PASS: capped profit, expiry, generation gating, renewal, legacy backfill, duplicate/concurrent payout, admin fee and atomic cancellation.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
