// Render the actual client component with only its API hooks replaced by fixtures.
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const client = path.resolve(__dirname, '../../gyonex-client');
const React = require(path.join(client, 'node_modules/react'));
const { renderToStaticMarkup } = require(path.join(client, 'node_modules/react-dom/server'));
const load = Module._load;
Module._load = function (id, parent, isMain) {
  if (id === '@/hooks/ai/useFilteredClosedPositions') return { useFilteredClosedPositions: () => ({ items: [], loading: false }) };
  if (id === '@/redux/features/ai-account/ai-accountApi') return { useCancelAiAccountMutation: () => [async () => {}, { isLoading: false }] };
  return load.call(this, id, parent, isMain);
};
const ts = require('typescript');
const filename = path.join(client, 'components/ai-accounts/AiAccountDetailsPage.tsx');
const componentModule = new Module(filename, module);
componentModule.filename = filename;
componentModule.paths = Module._nodeModulePaths(path.dirname(filename));
componentModule._compile(ts.transpileModule(require('node:fs').readFileSync(filename, 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
}).outputText, filename);
const Details = componentModule.exports.default;
const account = { _id: 'test', accountNumber: 123456, currency: 'USD', balance: 500, planPrice: 500,
  plan: 'core', earnedProfit: 750, profitCap: 1250, profitMultiplier: 2.5, cancellationFeePercent: 10,
  status: 'active', canCancel: false, cancelUntil: '2020-01-01' };
const render = acc => renderToStaticMarkup(React.createElement(Details, { acc, onBack() {} }));
const progress = render(account);
assert.match(progress, /role="progressbar"/);
assert.match(progress, /aria-valuenow="60"/);
assert.match(progress, /750\.00 \/ 1,250\.00 USDT/);
assert.doesNotMatch(progress, />Cancel Account</);
const expired = render({ ...account, earnedProfit: 1250, status: 'expired' });
assert.match(expired, /aria-valuenow="100"/);
assert.match(expired, /Profit and generation earnings are disabled/);
assert.doesNotMatch(expired, />Cancel Account</);
const early = render({ ...account, canCancel: true, cancelUntil: new Date(Date.now() + 86400000).toISOString() });
assert.match(early, />Cancel Account</);
assert.doesNotMatch(early, /role="progressbar"/);
// The client must also hide a stale server button immediately at the deadline.
assert.doesNotMatch(render({ ...account, canCancel: true }), />Cancel Account</);
console.log('PASS: actual Smart Trade component shows cancel before deadline, progress after deadline, and expiry/renewal at 100%.');
