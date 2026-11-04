require('ts-node/register/transpile-only');
require('tsconfig-paths/register');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const original = Module._load;
let current, account, writes, deliveries, failDelivery, quote, updates;
const positionModel = {
  findById: async () => current,
  findOneAndUpdate: async (filter, update) => {
    if (current.status !== filter.status) return null;
    writes++; Object.assign(current, update.$set); return current;
  },
  exists: async () => false,
};
Module._load = function(id, ...rest) {
  if (id === '@/models/AiPosition.model') return { __esModule:true, default:positionModel };
  if (id === '@/models/AiAccount.model') return { __esModule:true, default:{ findById:async()=>account, updateOne:async()=>updates++ } };
  if (id === '@/services/quote.service') return { getTopOfBook:async()=>quote, normalizeSymbol:s=>s };
  if (id === '@/services/quoteHub') return { subscribeQuote:()=>()=>{} };
  if (id === '@/services/specs.service') return { getContractSpec:()=>({digits:2}) };
  if (id === '@/services/autoCloseDistributor.service') return { distributeOnAutoCloseSimple:async()=> { deliveries++; if(failDelivery) throw Error('ledger unavailable'); } };
  return original.call(this,id,...rest);
};
const { closeSmartPosition } = require('../src/services/smartTradeClose.service');
const { tryCloseIfTpHitWithQuote } = require('../src/services/tpClose.ws.service');
Module._load = original;
const id = '012345678901234567890123';
function reset(extra={}) {
  writes=deliveries=updates=0; failDelivery=false; quote={bid:113,ask:114};
  account={userId:'owner',role:'admin',balance:100,equity:100};
  current={_id:id,accountId:id,status:'open',symbol:'BTCUSDT',side:'buy',entryPrice:100,lots:1,contractSize:1,commissionOpen:1,commissionClose:2,...extra};
  current.toObject=()=>({...current});
}
test('admin closes another account at market, subtracts both fees and delivers once',async()=>{
  reset(); const result=await closeSmartPosition(id,'administrator','admin');
  assert.equal(result.position.pnl,10); assert.equal(current.closePrice,113);
  assert.equal(current.closeReason,'manual'); assert.equal(result.distributionPending,false);
  assert.equal(deliveries,1); assert.equal(writes,1);
  await assert.rejects(closeSmartPosition(id,'administrator','admin'),/already closed/);
  assert.equal(deliveries,1);
});
test('unrelated users cannot close a position',async()=>{
  reset(); await assert.rejects(closeSmartPosition(id,'stranger','user'),/Not allowed/);
  assert.equal(writes,0); assert.equal(deliveries,0);
});
test('invalid quotes never close a position',async()=>{
  reset(); quote.bid=NaN; await assert.rejects(closeSmartPosition(id,'owner','user'),/unavailable/);
  assert.equal(writes,0);
});
test('failed delivery leaves a durable pending marker',async()=>{
  reset(); failDelivery=true; const result=await closeSmartPosition(id,'owner','user');
  assert.equal(result.distributionPending,true); assert.equal(current.distributionPending,true);
  assert.equal(current.status,'closed');
});
test('manual loss keeps history without paying a winning TP',async()=>{
  reset(); quote.bid=90; await closeSmartPosition(id,'owner','user');
  assert.equal(current.pnl,-13); assert.equal(current.is_loss,true); assert.equal(deliveries,0);
});
test('stopping a stop-loss order preserves history and clears the account flag',async()=>{
  reset({isStopLoss:true}); await closeSmartPosition(id,'administrator','admin');
  assert.equal(current.status,'closed'); assert.equal(updates,1); assert.equal(deliveries,0);
});

test('WS TP checks both sides at net USDT target and does not close a full tick early',async()=>{
  for(const side of ['buy','sell']) {
    reset({side,takeProfit:10});
    positionModel.updateOne=(filter,update)=>({exec:async()=>{
      if(current.status!=='open') return {modifiedCount:0};
      Object.assign(current,update.$set); writes++; return {modifiedCount:1};
    }});
    const near=side==='buy'?112.99:87.01;
    assert.equal((await tryCloseIfTpHitWithQuote(current,near,near,2)).closed,false);
    const hit=side==='buy'?113:87;
    assert.equal((await tryCloseIfTpHitWithQuote(current,hit,hit,2)).closed,true);
    assert.equal(current.pnl,10); assert.equal(deliveries,1);
    assert.equal((await tryCloseIfTpHitWithQuote(current,hit,hit,2)).closed,false);
    assert.equal(deliveries,1);
  }
});
