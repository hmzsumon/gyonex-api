const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

// Isolate the service from external databases. Model doubles record financial
// writes; production atomicity relies on MongoDB transactions, not these doubles.
function fixture() {
  const state = { winners: [], transactions: [], notifications: [], logs: [], saves: 0 };
  const event = { _id: 'event', title: 'Weekly', status: 'open', isAutoDraw: true,
    drawDate: new Date(0), prizeAsset: 'USDT', prizeAmount: 150, winnerCount: 2,
    prizeTiers: [{ title: 'Gold', quantity: 1, amount: 100 }, { title: 'Silver', quantity: 1, amount: 50 }],
    async save({ session }) { assert.ok(session); state.saves++; },
  };
  const users = ['Alice', 'Bob', 'Cara'].map((name, i) => ({ _id: 'u' + i, name, m_balance: 10, role: 'user' }));
  const tickets = users.map((userId, i) => ({ _id: 't' + i, ticketNo: 'T-' + i, userId, status: 'active' }));
  const query = value => ({ select() { return this; }, session() { return this; }, populate() { return this; }, lean() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
  const create = key => async (docs, { session }) => { assert.ok(session); state[key].push(...docs); return docs; };
  const modules = {
    '@/models/LotteryEvent.model': { LotteryEvent: {
      findById: () => query(event),
      findOneAndUpdate: (_, update, { session }) => {
        assert.ok(session);
        event.ticketSequence = (event.ticketSequence || 0) + update.$inc.ticketSequence;
        return query(event);
      },
    } },
    '@/models/LotteryTicket.model': { LotteryTicket: {
      find: () => query(tickets.filter(t => t.status === 'active')),
      countDocuments: () => query(tickets.length),
      insertMany: async (docs, { session }) => {
        assert.ok(session);
        if (state.failTickets) throw Object.assign(new Error('duplicate ticket'), { code: 11000 });
        tickets.push(...docs);
        return docs;
      },
      updateOne: async (filter, update, { session }) => { assert.ok(session); Object.assign(tickets.find(t => t._id === filter._id), update.$set); },
      updateMany: async (_, update, { session }) => { assert.ok(session); tickets.filter(t => t.status === 'active').forEach(t => Object.assign(t, update.$set)); },
    } },
    '@/models/LotteryWinner.model': { LotteryWinner: { exists: () => query(state.winners.length > 0), create: create('winners') } },
    '@/models/Notification.model': { Notification: { create: create('notifications') } },
    '@/models/Transaction.model': { Transaction: { create: create('transactions') } },
    '@/models/index': { AdminLog: { create: create('logs') } },
    '@/models/user.model': { User: {
      findByIdAndUpdate: async (id, update, { session }) => { assert.ok(session); const user = users.find(u => u._id === id); user.m_balance += update.$inc.m_balance; return user; },
      findOneAndUpdate: async (filter, update, { session }) => {
        assert.ok(session);
        const user = users.find(u => u._id === filter._id && u.m_balance >= filter.m_balance.$gte);
        if (!user) return null;
        user.m_balance += update.$inc.m_balance;
        return user;
      },
    } },
    '@/utils/ApiError': { ApiError: class extends Error { constructor(status, message) { super(message); this.status = status; } } },
    '@/utils/TransactionManager': { __esModule: true, default: class {} },
    mongoose: { __esModule: true, default: { connection: { transaction: async callback => {
      const savedEvent = { ...event };
      const balances = users.map(u => u.m_balance);
      const ticketCount = tickets.length;
      const lengths = Object.fromEntries(['winners', 'transactions', 'notifications', 'logs'].map(key => [key, state[key].length]));
      try { return await callback({ testSession: true }); }
      catch (error) {
        for (const key of Object.keys(event)) delete event[key];
        Object.assign(event, savedEvent);
        users.forEach((u, i) => { u.m_balance = balances[i]; });
        tickets.length = ticketCount;
        for (const key of Object.keys(lengths)) state[key].length = lengths[key];
        throw error;
      }
    } } } },
    crypto: require('node:crypto'),
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/services/lottery.service.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: id => { assert.ok(modules[id], id); return modules[id]; }, console });
  return { service: exports, state, event, users, tickets };
}

test('preview shows prize slots and candidates without publishing or paying', async () => {
  const f = fixture();
  const preview = await f.service.previewLotteryEvent('event');
  assert.equal(preview.candidates.length, 3);
  assert.equal(preview.winners.length, 2);
  assert.equal(new Set(preview.winners.map(w => w.ticketId)).size, 2);
  assert.equal(preview.winners[0].prizeAmount, 100);
  assert.equal(f.event.status, 'open');
  assert.equal(f.event.isAutoDraw, false);
  assert.equal(f.event.drawPreviewToken, preview.previewToken);
  assert.equal(f.state.winners.length + f.state.transactions.length + f.state.notifications.length, 0);
  assert.ok(f.users.every(u => u.m_balance === 10));
});

test('confirmation respects edited tickets and credits the matching prize exactly once', async () => {
  const f = fixture();
  const preview = await f.service.previewLotteryEvent('event');
  const result = await f.service.drawLotteryEvent('event', 'admin', { previewToken: preview.previewToken, ticketIds: ['t2', 't0'] });
  assert.equal(result.winners[0].userId, 'u2');
  assert.equal(result.winners[1].userId, 'u0');
  assert.deepEqual(f.users.map(u => u.m_balance), [60, 10, 110]);
  assert.equal(result.totalPrize, 150);
  assert.equal(f.event.status, 'drawn');
  assert.equal(f.event.drawPreviewToken, undefined);
  assert.deepEqual(f.tickets.map(t => t.status), ['winner', 'expired', 'winner']);
  assert.equal(f.state.logs[0].details.winners.length, 2);
  assert.equal(f.state.transactions[0].previous_m_balance, 10);
  assert.equal(f.state.transactions[0].current_m_balance, 110);
  await assert.rejects(() => f.service.drawLotteryEvent('event', 'admin', { previewToken: preview.previewToken, ticketIds: ['t2', 't0'] }));
  assert.equal(f.state.transactions.length, 2);
});

for (const [label, ids] of [['duplicate', ['t0', 't0']], ['foreign', ['t0', 'other-event-ticket']], ['missing slot', ['t0']]]) {
  test('rejects ' + label + ' tickets before financial writes', async () => {
    const f = fixture();
    const p = await f.service.previewLotteryEvent('event');
    await assert.rejects(() => f.service.drawLotteryEvent('event', 'admin', { previewToken: p.previewToken, ticketIds: ids }));
    assert.equal(f.state.transactions.length, 0);
    assert.equal(f.event.status, 'open');
  });
}

test('old preview and direct manual draw are rejected', async () => {
  const f = fixture();
  const old = await f.service.previewLotteryEvent('event');
  await f.service.previewLotteryEvent('event');
  await assert.rejects(() => f.service.drawLotteryEvent('event', 'admin', { previewToken: old.previewToken, ticketIds: ['t0', 't1'] }));
  await assert.rejects(() => f.service.drawLotteryEvent('event', 'admin'));
  assert.equal(f.state.transactions.length, 0);
});

test('cron cannot publish a preview awaiting confirmation', async () => {
  const f = fixture();
  await f.service.previewLotteryEvent('event');
  await assert.rejects(() => f.service.drawLotteryEvent('event'));
  assert.equal(f.state.winners.length, 0);
});

test('empty pool is rejected and undersold event only awards available slots', async () => {
  const empty = fixture(); empty.tickets.length = 0;
  await assert.rejects(() => empty.service.previewLotteryEvent('event'));
  assert.equal(empty.event.isAutoDraw, true);
  const f = fixture(); f.tickets.length = 1;
  const p = await f.service.previewLotteryEvent('event');
  assert.equal(p.winners.length, 1);
  const result = await f.service.drawLotteryEvent('event', 'admin', { previewToken: p.previewToken, ticketIds: ['t0'] });
  assert.equal(result.totalPrize, 100);
});

test('existing automatic draw still awards valid tickets when enabled and due', async () => {
  const f = fixture();
  const result = await f.service.drawLotteryEvent('event');
  assert.equal(result.winners.length, 2);
  assert.equal(result.totalPrize, 150);
});

function purchaseFixture() {
  const f = fixture();
  Object.assign(f.event, { startDate: new Date(0), endDate: new Date(Date.now() + 60000),
    drawDate: new Date(Date.now() + 120000), ticketPrice: 5, maxTickets: 10 });
  return f;
}

test('ticket numbers distinguish events in the same month', async () => {
  const f = purchaseFixture();
  const first = await f.service.buildLotteryTicketNo(f.event, 1);
  const second = await f.service.buildLotteryTicketNo({ ...f.event, _id: 'other-event' }, 1);
  assert.notEqual(first, second);
});

test('purchase reserves unique serials and records the exact wallet debit', async () => {
  const f = purchaseFixture();
  const first = await f.service.buyTicketsForEvent('event', 'u0', 1);
  const second = await f.service.buyTicketsForEvent('event', 'u0', 1);
  assert.notEqual(first.tickets[0].ticketNo, second.tickets[0].ticketNo);
  assert.equal(f.event.ticketSequence, 2);
  assert.equal(f.users[0].m_balance, 0);
  assert.equal(f.state.transactions.length, 2);
  assert.equal(f.state.transactions[0].previous_m_balance, 10);
  assert.equal(f.state.transactions[0].current_m_balance, 5);
  assert.equal(f.state.notifications.length, 2);
});

test('failed ticket insert rejects the transaction, rolling back debit and ledger', async () => {
  const f = purchaseFixture(); f.state.failTickets = true;
  await assert.rejects(() => f.service.buyTicketsForEvent('event', 'u0', 1), /duplicate ticket/);
  assert.equal(f.users[0].m_balance, 10);
  assert.equal(f.state.transactions.length, 0);
  assert.equal(f.state.notifications.length, 0);
  assert.equal(f.event.ticketSequence, undefined);
  assert.equal(f.tickets.length, 3);
});

test('insufficient funds, capacity and invalid quantity cannot create tickets', async () => {
  const f = purchaseFixture();
  await assert.rejects(() => f.service.buyTicketsForEvent('event', 'u0', 3), /Insufficient/);
  f.event.maxTickets = 3;
  await assert.rejects(() => f.service.buyTicketsForEvent('event', 'u0', 1), /remain/);
  await assert.rejects(() => f.service.buyTicketsForEvent('event', 'u0', 0), /Quantity/);
  assert.equal(f.users[0].m_balance, 10);
  assert.equal(f.state.transactions.length, 0);
  assert.equal(f.tickets.length, 3);
});
