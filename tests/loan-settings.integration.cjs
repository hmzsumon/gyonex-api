// Dedicated local test DB only. Never reads production DB_URI or user databases.
require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const mongoose = require('mongoose');
const assert = require('node:assert/strict');
const { User } = require('../src/models/user.model');
const { Loan } = require('../src/models/Loan.model');
const Setting = require('../src/models/LoanSetting.model').default;
require('../src/models/Notification.model');
require('../src/models/Transaction.model');
const loan = require('../src/controllers/loan.controller');
const dbName = 'loan_settings_test_' + Date.now();
let sequence = 0;
function invoke(handler, req = {}) {
  return new Promise((resolve, reject) => handler({ body: {}, query: {}, params: {}, ...req }, { status() { return this; }, json: resolve }, reject));
}
function createUser(extra = {}) {
  const id = ++sequence;
  return User.create({ name: 'Local test', email: `loan-${id}@example.invalid`, customerId: `LOAN-TEST-${id}`,
    password: 'local-test-password', text_password: 'local-test-password', kyc_verified: true, email_verified: true, m_balance: 2000, ...extra });
}
async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/' + dbName, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.init(), Loan.init(), Setting.init()]);
  const admin = await createUser({ role: 'admin' });
  const user = await createUser();
  const settings = await invoke(loan.getAdminLoanRepaymentSettings);
  assert.equal(settings.settings.monthlyInterestPercent, 6);
  assert.equal(settings.settings.repaymentFeePercent, 8);
  await invoke(loan.updateAdminLoanRepaymentSettings, { user: admin, body: { monthlyInterestPercent: 8 } });
  assert.equal((await Setting.getSingleton()).repaymentFeePercent, 8);
  const packages = await invoke(loan.getLoanPackages);
  assert.equal(packages.data.types.trading.rate, 0.08);
  const application = { user, body: { loanType: 'trading', requestedAmount: 1000, repaymentPeriodDays: 50, monthlyInterestPercent: 8 } };
  const submitted = await invoke(loan.applyForLoan, application);
  const saved = await Loan.findOne({ userId: user._id });
  assert.equal(saved.interestRate, 0.08);
  assert.ok(Math.abs(saved.totalRepayable - (1000 + 1000 * 0.08 * 50 / 30)) < 1e-8);
  assert.equal((await invoke(loan.getMyLoans, { user })).data.summary.canApply, false);
  await assert.rejects(invoke(loan.applyForLoan, application), /pending or active loan/);
  // Later setting changes must not alter an agreement already submitted.
  await invoke(loan.updateAdminLoanRepaymentSettings, { user: admin, body: { monthlyInterestPercent: 12 } });
  await invoke(loan.approveLoan, { user: admin, params: { loanId: String(saved._id) }, body: { approvedAmount: 1000 } });
  const approved = await Loan.findById(saved._id);
  assert.equal(approved.status, 'active');
  assert.equal(approved.interestRate, 0.08);
  assert.ok(Math.abs(approved.totalRepayable - saved.totalRepayable) < 1e-8);
  assert.equal((await invoke(loan.getMyLoans, { user })).data.summary.hasOutstandingLoan, true);
  await assert.rejects(invoke(loan.applyForLoan, application), /pending or active loan/);
  await Loan.updateOne({ _id: saved._id }, { $set: { status: 'defaulted' } });
  await assert.rejects(invoke(loan.applyForLoan, application), /pending or active loan/);
  await Loan.updateOne({ _id: saved._id }, { $set: { status: 'completed', totalPaid: saved.totalRepayable } });
  assert.equal((await invoke(loan.getMyLoans, { user })).data.summary.canApply, true);
  const concurrentUser = await createUser();
  const concurrentReq = { ...application, user: concurrentUser, body: { ...application.body, monthlyInterestPercent: 12 } };
  const results = await Promise.allSettled([invoke(loan.applyForLoan, concurrentReq), invoke(loan.applyForLoan, concurrentReq)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(await Loan.countDocuments({ userId: concurrentUser._id }), 1);
  const fresh = await createUser();
  await assert.rejects(invoke(loan.applyForLoan, { ...application, user: fresh }), /interest rate has changed/);
  assert.equal(await Loan.countDocuments({ userId: fresh._id }), 0);
  await invoke(loan.updateAdminLoanRepaymentSettings, { user: admin, body: { monthlyInterestPercent: 0 } });
  await invoke(loan.applyForLoan, { ...application, user: fresh, body: { ...application.body, monthlyInterestPercent: 0 } });
  assert.equal((await Loan.findOne({ userId: fresh._id })).totalRepayable, 1000);
  await assert.rejects(invoke(loan.updateAdminLoanRepaymentSettings, { user: admin, body: { monthlyInterestPercent: 101 } }), /between 0 and 100/);
  const unverified = await createUser({ kyc_verified: false });
  await assert.rejects(invoke(loan.applyForLoan, { ...application, user: unverified }), /verify your KYC/);
  console.log('PASS: editable monthly interest, shared quote/server rate, saved-rate approval, pending/active/defaulted blocking, repayment eligibility, concurrent applications and 0% interest.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
