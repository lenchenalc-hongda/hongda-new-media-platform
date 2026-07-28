// ===== AccountLearningRepository =====
// Minimum viable: interface + mock implementation
import type { AccountLearningProfile } from './types';

export interface AccountLearningRepository {
  getLearningForAccount(accountId: string): Promise<AccountLearningProfile>;
  getLearningForAccountSync(accountId: string): AccountLearningProfile;
}

class MockAccountLearningRepositoryImpl implements AccountLearningRepository {
  async getLearningForAccount(accountId: string): Promise<AccountLearningProfile> {
    return this.getLearningForAccountSync(accountId);
  }

  getLearningForAccountSync(accountId: string): AccountLearningProfile {
    // Return empty profile — no real data yet
    return {
      period: '2026-07',
      successful_patterns: [],
      weak_patterns: [],
      audience_feedback: [],
      recommended_adjustments: [],
      confidence: 'low',
    };
  }
}

export const mockLearningRepo = new MockAccountLearningRepositoryImpl();

export function getLearningRepository(): AccountLearningRepository {
  return mockLearningRepo;
}

// ===== Inject learning into prompt (only when confident) =====

export function buildLearningContext(
  profile: AccountLearningProfile,
  maxResults: number,
): string {
  if (profile.confidence === 'low' && profile.successful_patterns.length === 0) {
    return '';
  }

  var lines: string[] = [];
  var count = 0;

  var patterns = profile.successful_patterns.concat(profile.weak_patterns);
  for (var i = 0; i < patterns.length && count < maxResults; i++) {
    lines.push('- ' + patterns[i]);
    count++;
  }

  if (lines.length === 0) return '';
  return '【近期表现】\n' + lines.join('\n');
}
