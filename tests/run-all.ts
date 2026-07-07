#!/usr/bin/env node
// ===== Run All Smoke Tests =====
// Starts the dev server, waits for it to be ready, then runs all smoke tests.

import { spawn } from 'child_process';
import { resolve } from 'path';

const BASE_URL = 'http://localhost:3000';
const PROJECT_DIR = resolve(import.meta.dirname || __dirname, '..');

async function waitForServer(url: string, maxRetries = 30): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status >= 200) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 2000));
    process.stdout.write('.');
  }
  return false;
}

async function run() {
  console.log('Starting Next.js dev server...');
  const server = spawn('node', ['node_modules/next/dist/bin/next', 'dev', '--port', '3000'], {
    cwd: PROJECT_DIR,
    stdio: 'pipe',
    env: { ...process.env, CI: 'true' },
  });

  server.stdout.on('data', (d) => process.stdout.write(d));
  server.stderr.on('data', (d) => process.stderr.write(d));

  console.log('Waiting for server...');
  const ready = await waitForServer(BASE_URL);
  if (!ready) {
    console.error('\n❌ Server failed to start');
    server.kill();
    process.exit(1);
  }
  console.log('\n✅ Server is ready');

  // Run each test file
  const tests = [
    'tests/e2e/routes.spec.ts',
    'tests/e2e/topics.spec.ts',
    'tests/e2e/knowledge.spec.ts',
    'tests/e2e/scripts.spec.ts',
  ];

  let allPassed = true;
  for (const testFile of tests) {
    console.log(`\n--- Running: ${testFile} ---`);
    try {
      const { execSync } = await import('child_process');
      execSync(`npx tsx ${testFile}`, {
        cwd: PROJECT_DIR,
        stdio: 'inherit',
        env: { ...process.env, BASE_URL, CI: 'true' },
      });
    } catch (err: any) {
      console.error(`❌ Test failed: ${testFile}`);
      allPassed = false;
    }
  }

  server.kill();
  console.log(allPassed ? '\n✅ ALL SMOKE TESTS PASSED' : '\n❌ SOME TESTS FAILED');
  process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
