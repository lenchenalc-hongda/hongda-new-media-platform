// ===== Account Repository =====
// 抽象接口，后续可接数据库实现
import type { AccountV2 } from './types';

export interface AccountRepository {
  getActiveById(id: string): Promise<AccountV2 | null>;
  getActiveByIdSync(id: string): AccountV2 | null;
  getAllActive(): Promise<AccountV2[]>;
  getAllActiveSync(): AccountV2[];
}
