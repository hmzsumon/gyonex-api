const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const exportsObject = {};
const source = fs.readFileSync(path.join(__dirname, '../src/middlewares/errorHandler.ts'), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { exports: exportsObject, console: { error() {} } });
function respond(error, headersSent = false) {
  const result = {};
  exportsObject.errorHandler(error, { originalUrl: '/lottery/events/example/buy', method: 'POST' }, {
    headersSent,
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; },
  }, error => { result.forwarded = error; });
  return result;
}
for (const keyValue of [undefined, null]) {
  test(`bulk duplicate error with ${keyValue} keyValue returns JSON instead of throwing`, () => {
    const result = respond({ name: 'MongoBulkWriteError', code: 11000, keyValue, message: 'E11000 duplicate key' });
    assert.equal(result.status, 400);
    assert.equal(result.body.success, false);
    assert.equal(typeof result.body.message, 'string');
    assert.ok(!result.body.message.includes('undefined'));
  });
}
test('duplicate field name uses keyValue or keyPattern, without leaking values', () => {
  for (const details of [{ keyValue: { ticketNo: 'private-ticket' } }, { keyPattern: { ticketNo: 1 } }]) {
    const result = respond({ code: 11000, ...details });
    assert.equal(result.body.message, 'Duplicate field value entered: ticketNo');
  }
});
test('validation errors tolerate absent errors and null members', () => {
  assert.equal(respond({ name: 'ValidationError', message: 'Invalid input' }).body.message, 'Invalid input');
  assert.equal(respond({ name: 'ValidationError', errors: { a: null, b: { message: 'Name required' } } }).body.message, 'Name required');
});
test('normal errors and API metadata retain the response contract', () => {
  const result = respond({ statusCode: 403, message: 'Verification required', meta: { code: 'KYC_REQUIRED' } });
  assert.equal(result.status, 403);
  assert.equal(result.body.code, 'KYC_REQUIRED');
  assert.equal(result.body.error, result.body.message);
  assert.equal(respond(null).status, 500);
  assert.equal(respond({ statusCode: 999 }).status, 500);
  assert.equal(respond({ status: 400, message: 'Malformed JSON' }).status, 400);
});
test('already sent responses delegate to Express', () => {
  const error = new Error('Stream failed');
  const result = respond(error, true);
  assert.equal(result.forwarded, error);
  assert.equal(result.body, undefined);
});
