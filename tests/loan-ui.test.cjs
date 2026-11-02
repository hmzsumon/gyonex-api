// Render the actual local React components with account/API fixtures, no browser auth changes.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const assert = require('node:assert/strict'), ts = require('typescript');
const client = path.resolve(__dirname, '../../gyonex-client');
const React = require(path.join(client, 'node_modules/react'));
const { renderToStaticMarkup } = require(path.join(client, 'node_modules/react-dom/server'));
let user = { kyc_verified: true, m_balance: 1000 };
let loans = [], summary = { canApply: true };
const load = Module._load;
const transpile = (m, filename) => m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText, filename);
require.extensions['.tsx'] = transpile;
require.extensions['.ts'] = transpile;
Module._load = function(id, parent, isMain) {
  if (id === 'react-redux') return { useSelector: fn => fn({ auth: { user } }) };
  if (id === '@/redux/features/loan/loanApi') return {
    useGetMyLoansQuery: () => ({ data: { data: { loans, summary } }, isLoading: false }),
    useGetLoanRepaymentSettingsQuery: () => ({ data: { settings: { monthlyInterestPercent: 8, repaymentFeePercent: 8 } }, refetch() {} }),
    useApplyForLoanMutation: () => [() => {}, { isLoading: false }],
  };
  if (id.startsWith('@/')) return load.call(this, path.join(client, id.slice(2)), parent, isMain);
  return load.call(this, id, parent, isMain);
};
const Page = require(path.join(client, 'app/(auth)/loans/page.tsx')).default;
const render = () => renderToStaticMarkup(React.createElement(Page));
const ready = render();
assert.match(ready, /Select loan package/);
assert.match(ready, /8<!-- -->% \/ month|8% \/ month/);
assert.doesNotMatch(ready, /KYC verified — ready to apply/);
assert.doesNotMatch(ready, /Apply now/);
assert.doesNotMatch(ready, /KYC verified users need no extra document/);
user = { ...user, kyc_verified: false };
assert.match(render(), /KYC verification required/);
user.kyc_verified = true;
loans = [{ _id: 'loan', loanType: 'trading', status: 'active', requestedAmount: 1000, approvedAmount: 1000, totalRepayable: 1100, totalPaid: 0, interestRate: 0.06 }];
summary = { canApply: false, hasOutstandingLoan: true, activeLoans: 1 };
const approved = render();
assert.match(approved, /My Loans/);
assert.match(approved, /Repay/);
assert.doesNotMatch(approved, /Select loan package|Submit for Under Review|Apply Loan|Apply now|Get a fast loan/);
// Eligibility must be respected even when the outstanding loan is outside this page of results.
loans = [];
assert.doesNotMatch(render(), /Apply Loan|Select loan package/);
summary = { canApply: true };
assert.match(render(), /Select loan package/);
console.log('PASS: verified KYC card hidden, dynamic rate labels, approved-loan My Loans only, and no empty-list application escape.');
