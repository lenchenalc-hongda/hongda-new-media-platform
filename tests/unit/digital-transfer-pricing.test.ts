import { strict as assert } from 'node:assert';
import { loadPriceSchedule, quoteDigitalTransfer } from '../../src/lib/digital-transfer-pricing';

// Synthetic monotonically increasing amounts: this test does not publish the confidential production price list.
const AREAS = [1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8,8.5,9,9.5,10,11,12,12.5,13,14,15,16,17,17.5,18,19,20,22,22.5,24,25,26,28,30,32,34,35,36,38,40,44,45,48,50,52,56,60,64,68,70,72,76,80,90,100,120,140,160,180,200];
const syntheticAmount = (a: number) => a <= 50
  ? Math.round(300 + (a - 1.5) * (1330 / 48.5))
  : a <= 60 ? Math.round(1630 + (a - 50) * 7)
  : Math.round(1700 + (a - 60) * 5);
const fixture = AREAS.map(a => `${a}:${syntheticAmount(a)}`).join(',');
const tiers = loadPriceSchedule(fixture);
assert.ok(tiers, 'synthetic 63-tier configuration passes');
assert.equal(tiers.length, 63);

for (const area of [1.5,1.51,2,19.2,22.1,49,50,59.9,60,60.1,115,120,200]) {
  const got = quoteDigitalTransfer(area, tiers);
  const target = AREAS.find(a => a >= area);
  assert.equal(got.ok, true, 'valid quote ' + area);
  if (got.ok) {
    assert.equal(got.billableArea, target);
    assert.equal(got.amountCny, syntheticAmount(target!));
  }
}
const important = quoteDigitalTransfer(115, tiers);
assert.equal(important.ok, true);
if (important.ok) { assert.equal(important.billableArea, 120); assert.equal(important.amountCny, 2000); }

for (const [area,code] of [[0,'INVALID_AREA'],[-1,'INVALID_AREA'],[NaN,'INVALID_AREA'],[Infinity,'INVALID_AREA'],[1.49,'BELOW_MINIMUM'],[200.01,'ABOVE_MAXIMUM']] as const) {
  const got = quoteDigitalTransfer(area,tiers);
  assert.equal(got.ok, false);
  if (!got.ok) assert.equal(got.code,code);
}
assert.equal(quoteDigitalTransfer('115',tiers).ok,false);
assert.equal(quoteDigitalTransfer(115,null).ok,false, 'missing preview configuration fails closed');
assert.equal(loadPriceSchedule(undefined),null);
assert.equal(loadPriceSchedule(fixture.replace('50:1630','50:1650')),null,'50m² unauthorized pricing fails closed');
assert.equal(loadPriceSchedule(fixture.replace('60:1700','60:1680')),null,'60m² unauthorized pricing fails closed');
assert.equal(loadPriceSchedule(fixture.replace('64:1720','64:1690')),null,'descending prices fail closed');
assert.equal(loadPriceSchedule(fixture.substring(fixture.indexOf(',')+1)),null,'missing tier fails closed');
assert.equal(loadPriceSchedule(fixture+',200:2400'),null,'duplicate tier fails closed');
console.log('Digital transfer pricing: synthetic 63-tier, 115m², boundaries and invalid-config checks PASS');
