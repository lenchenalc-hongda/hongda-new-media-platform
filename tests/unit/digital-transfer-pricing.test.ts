import { strict as assert } from 'node:assert';
import { loadPriceSchedule, quoteDigitalTransfer } from '../../src/lib/digital-transfer-pricing';
const raw = process.env.DIGITAL_TRANSFER_PRICE_TIERS_TEST;
if (!raw) throw new Error('Test input fixture missing: DIGITAL_TRANSFER_PRICE_TIERS_TEST');
const tiers = loadPriceSchedule(raw);
assert.ok(tiers);
assert.equal(tiers.length,63);
for (const [area,expectedTier,amount] of [[1.5,1.5,300],[1.51,2,310],[19.2,20,890],[22.1,22.5,978],[49,50,1630],[50,50,1630],[59.9,60,1700],[60,60,1700],[60.1,64,1700],[200,200,2400]] as const) {
 const got = quoteDigitalTransfer(area,tiers);
 assert.equal(got.ok,true, 'valid quote '+area);
 if(got.ok){assert.equal(got.billableArea,expectedTier);assert.equal(got.amountCny,amount);}
}
for(const [area,code] of [[0,'INVALID_AREA'],[-1,'INVALID_AREA'],[NaN,'INVALID_AREA'],[Infinity,'INVALID_AREA'],[1.49,'BELOW_MINIMUM'],[200.01,'ABOVE_MAXIMUM']] as const) {
 const got=quoteDigitalTransfer(area,tiers); assert.equal(got.ok,false); if(!got.ok) assert.equal(got.code,code);
}
assert.equal(quoteDigitalTransfer('19.2',tiers).ok,false);
assert.equal(quoteDigitalTransfer(19.2,null).ok,false);
assert.equal(loadPriceSchedule(undefined),null);
assert.equal(loadPriceSchedule(raw.replace('50:1630','50:1650')),null);
assert.equal(loadPriceSchedule(raw.replace('60:1700','60:1680')),null);
assert.equal(loadPriceSchedule(raw.replace('64:1700','64:1690')),null);
console.log('Digital transfer pricing boundary / conflicting tier / configuration tests PASS');
