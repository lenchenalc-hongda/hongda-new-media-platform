// ===== Account V2 模块入口 =====
export * from './types';
export * from './schema';
export * from './repository';
export { getAccountRepository, mockAccountRepo } from './mock-repository';
export { MOCK_ACCOUNTS_V2 } from './examples/xuzong.account';
