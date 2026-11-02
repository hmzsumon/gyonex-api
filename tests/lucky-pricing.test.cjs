require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const { luckyPackagePricing } = require('../src/utils/luckyPricing');
const Type = require('../src/models/LuckyCardType.model').default;
const Package = require('../src/models/LuckyPackage.model').default;
const Pool = require('../src/models/LuckyPrizePool.model').default;
const Config = require('../src/models/LuckyPoolConfig.model').default;
const Tier = require('../src/models/LuckyPrizeTier.model').default;
const Card = require('../src/models/LuckyCard.model').default;
const Purchase = require('../src/models/LuckyPurchase.model').default;
const { User } = require('../src/models/user.model');
const Manager = require('../src/utils/TransactionManager').default;
const controller = require('../src/controllers/lucky.controller');
const restores = [];
function stub(object, key, value) { const old = object[key]; object[key] = value; restores.push(() => object[key] = old); }
afterEach(() => { while (restores.length) restores.pop()(); });
function invoke(handler, req = {}) { return new Promise((resolve, reject) => handler(req, { status() { return this; }, json: resolve }, reject)); }
function fixture() {
  const type = { _id: new Types.ObjectId(), key: 'mini', name: 'Lucky Mini', price: 5, isActive: true, save: async () => {} };
  const packages = [
    { _id: new Types.ObjectId(), name: '3 cards', cardCount: 3, bonusCards: 0, price: 60, regularPrice: 75, isActive: true },
    { _id: new Types.ObjectId(), name: '5 cards', cardCount: 5, bonusCards: 0, price: 95, regularPrice: 125, isActive: true },
    { _id: new Types.ObjectId(), name: '10 + 1', cardCount: 10, bonusCards: 1, price: 180, regularPrice: 240, isActive: true },
  ];
  packages.forEach(p => p.cardType = type);
  stub(Pool, 'countDocuments', async () => 1);
  stub(Config, 'getSingleton', async () => ({}));
  stub(Pool, 'find', () => ({ sort: async () => [] }));
  stub(Type, 'find', () => ({ sort: async () => [type] }));
  stub(Type, 'findById', async () => type);
  stub(Package, 'find', () => ({ sort: async () => packages }));
  stub(Package, 'findById', () => ({ populate: async () => packages[0] }));
  stub(Tier, 'find', () => ({ sort: async () => [] }));
  stub(Card, 'countDocuments', async () => 0);
  return { type, packages };
}
test('unit pricing respects paid cards, free bonuses and valid whole quantities', () => {
  assert.equal(luckyPackagePricing(5, 3).price, 15);
  assert.equal(luckyPackagePricing(5, 5).price, 25);
  assert.deepEqual(luckyPackagePricing(5, 10, 1), { totalCards: 11, price: 50, regularPrice: 55, perCard: 4.55, perCardRegular: 5, discountPercent: 9 });
  assert.equal(luckyPackagePricing(0.1, 3).price, 0.3);
  for (const args of [[5, 0], [5, 1.5], [-1, 3], [5, 3, -1], [Infinity, 3]]) assert.throws(() => luckyPackagePricing(...args));
});
test('shop and admin ignore stale bundle prices after editing the card unit price', async () => {
  const { type } = fixture();
  const shop = await invoke(controller.getLuckyShop);
  assert.deepEqual(shop.shop[0].packages.map(p => p.price), [15, 25, 50]);
  assert.deepEqual(shop.shop[0].packages.map(p => p.regularPrice), [0, 0, 55]);
  const admin = await invoke(controller.adminListCardTypes);
  assert.deepEqual(admin.cardTypes[0].packages.map(p => p.price), [15, 25, 50]);
  await invoke(controller.adminSaveCardType, { body: { _id: String(type._id), price: 7 } });
  const updated = await invoke(controller.getLuckyShop);
  assert.deepEqual(updated.shop[0].packages.map(p => p.price), [21, 35, 70]);
});
test('checkout charges the same calculated total; stale quotes cannot debit balance', async () => {
  const { type, packages } = fixture();
  const user = { _id: new Types.ObjectId(), customerId: 'TEST', m_balance: 100, save: async () => {} };
  const charges = [], purchases = [];
  stub(User, 'findById', async () => user);
  stub(Manager.prototype, 'createTransaction', async tx => { charges.push(tx.amount); });
  stub(Purchase, 'create', async p => { purchases.push(p); return { _id: new Types.ObjectId(), ...p }; });
  stub(Card, 'insertMany', async cards => cards.map(c => ({ _id: new Types.ObjectId(), ...c })));
  const req = { user: { _id: user._id }, body: { packageId: String(packages[0]._id), expectedPrice: 15 } };
  const bought = await invoke(controller.buyLuckyPackage, req);
  assert.equal(bought.purchase.totalPrice, 15);
  assert.equal(bought.cards.length, 3);
  assert.equal(user.m_balance, 85);
  assert.deepEqual(charges, [15]);
  assert.equal(purchases[0].unitPrice, 5);
  type.price = 7;
  await assert.rejects(invoke(controller.buyLuckyPackage, req), /price has changed/);
  assert.equal(user.m_balance, 85);
  assert.equal(charges.length, 1);
  req.body.expectedPrice = 21;
  assert.equal((await invoke(controller.buyLuckyPackage, req)).purchase.totalPrice, 21);
  assert.equal(user.m_balance, 64);
});
