// Internal contract. The price schedule is provided at runtime, never committed to this public repository.
export type PriceTier = readonly [area: number, price: number];
export type QuoteResult =
  | { ok: true; inputArea: number; billableArea: number; amountCny: number; scheduleVersion: string }
  | { ok: false; code: 'INVALID_AREA' | 'BELOW_MINIMUM' | 'ABOVE_MAXIMUM' | 'UNAVAILABLE'; message: string };

export function loadPriceSchedule(raw: string | undefined): PriceTier[] | null {
  if (!raw) return null;
  const pairs = raw.split(',').map(s => s.trim().split(':').map(Number));
  if (pairs.length !== 63) return null;
  const tiers: PriceTier[] = [];
  for (const pair of pairs) {
    if (pair.length !== 2) return null;
    const [area, price] = pair;
    if (!Number.isFinite(area) || !Number.isSafeInteger(price) || area <= 0 || price <= 0) return null;
    if (tiers.length && (area <= tiers[tiers.length - 1][0] || price < tiers[tiers.length - 1][1])) return null;
    tiers.push([area, price]);
  }
  if (tiers[0][0] !== 1.5 || tiers[tiers.length - 1][0] !== 200) return null;
  const expectedAreas = [1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8,8.5,9,9.5,10,11,12,12.5,13,14,15,16,17,17.5,18,19,20,22,22.5,24,25,26,28,30,32,34,35,36,38,40,44,45,48,50,52,56,60,64,68,70,72,76,80,90,100,120,140,160,180,200];
  if (!expectedAreas.every((a,i) => tiers[i][0] === a)) return null;
  if (tiers.find(t=>t[0]===50)?.[1] !== 1630 || tiers.find(t=>t[0]===60)?.[1] !== 1700) return null;
  return tiers;
}

export function quoteDigitalTransfer(area: unknown, tiers: readonly PriceTier[] | null): QuoteResult {
  if (typeof area !== 'number' || !Number.isFinite(area) || area <= 0) return { ok:false, code:'INVALID_AREA', message:'请输入大于0的有效面积' };
  if (area < 1.5) return { ok:false, code:'BELOW_MINIMUM', message:'不足1.5 m²，请人工核价' };
  if (area > 200) return { ok:false, code:'ABOVE_MAXIMUM', message:'超过200 m²，请人工核价' };
  if (!tiers) return { ok:false, code:'UNAVAILABLE', message:'内部报价配置不可用，请联系管理员' };
  const tier = tiers.find(([threshold]) => threshold >= area);
  if (!tier) return { ok:false, code:'UNAVAILABLE', message:'没有可用的报价档位' };
  return { ok:true, inputArea:area, billableArea:tier[0], amountCny:tier[1], scheduleVersion:'HD-DTF-2026-10-25-v1' };
}
