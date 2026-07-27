// ===== Mock Account Repository =====
import type { AccountV2 } from './types';
import type { AccountRepository } from './repository';
import { MOCK_ACCOUNTS_V2 } from './examples/xuzong.account';

class MockAccountRepositoryImpl implements AccountRepository {
  private accounts: AccountV2[] = [];

  constructor() {
    this.accounts = [...MOCK_ACCOUNTS_V2];
  }

  async getActiveById(id: string): Promise<AccountV2 | null> {
    var account = this.accounts.find(function(a) { return a.id === id && a.status === 'active'; });
    return account || null;
  }

  getActiveByIdSync(id: string): AccountV2 | null {
    var account = this.accounts.find(function(a) { return a.id === id && a.status === 'active'; });
    return account || null;
  }

  async getAllActive(): Promise<AccountV2[]> {
    return this.accounts.filter(function(a) { return a.status === 'active'; });
  }

  getAllActiveSync(): AccountV2[] {
    return this.accounts.filter(function(a) { return a.status === 'active'; });
  }

  /** 注册或更新账号（用于测试） */
  register(account: AccountV2): void {
    var idx = this.accounts.findIndex(function(a) { return a.id === account.id; });
    if (idx >= 0) {
      this.accounts[idx] = account;
    } else {
      this.accounts.push(account);
    }
  }
}

export const mockAccountRepo = new MockAccountRepositoryImpl();

/** 获取单例 */
export function getAccountRepository(): AccountRepository {
  return mockAccountRepo;
}
