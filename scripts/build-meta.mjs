// ===== Build Metadata Script =====
// Environment-first commit SHA with safe local fallback.
// Works in environments where .git is unavailable or blocked.
// Outputs: build-meta.json in the project root.

import { writeFileSync } from 'fs';

const sha =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.COMMIT_SHA ||
  process.env.SOURCE_VERSION ||
  'dev';

const timestamp = new Date().toISOString();

const meta = { sha, timestamp, buildNumber: Date.now() };

writeFileSync('build-meta.json', JSON.stringify(meta, null, 2));
console.log('[build-meta]', JSON.stringify(meta));
