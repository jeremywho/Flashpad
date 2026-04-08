#!/usr/bin/env node
/**
 * Run each E2E test individually with a fresh backend between runs.
 *
 * The .NET backend suffers thread pool starvation after an Electron app
 * establishes and then closes a SignalR WebSocket connection. Each test
 * is run as a separate Playwright invocation so the globalSetup spins
 * up a fresh backend for each test.
 */
import { execSync } from 'child_process';

const tests = [
  { name: 'L1: File drop (plain)', pattern: 'L1:' },
  { name: 'L2: File drop (frontmatter)', pattern: 'L2:' },
  { name: 'L4: External file edit', pattern: 'L4:' },
  { name: 'L7: External file delete', pattern: 'L7:' },
  { name: 'S10: Reconnect catch-up', pattern: 'S10:' },
  { name: 'Sync: API notes to local', pattern: 'Notes created via API' },
];

let passed = 0;
let failed = 0;
const failures = [];

for (const test of tests) {
  // Kill any lingering backend from previous run
  try { execSync('kill $(lsof -ti :15000) 2>/dev/null', { stdio: 'ignore' }); } catch {}
  await new Promise(r => setTimeout(r, 1000));

  process.stdout.write(`  ${test.name} ... `);
  try {
    execSync(
      `npx playwright test --config playwright.config.ts -g "${test.pattern}" --timeout 60000`,
      { stdio: 'pipe', timeout: 120_000 }
    );
    console.log('\x1b[32mPASSED\x1b[0m');
    passed++;
  } catch (err) {
    console.log('\x1b[31mFAILED\x1b[0m');
    failed++;
    failures.push(test.name);
  }
}

// Kill any remaining backend
try { execSync('kill $(lsof -ti :15000) 2>/dev/null', { stdio: 'ignore' }); } catch {}

console.log(`\n  ${passed} passed, ${failed} failed, ${tests.length} total`);
if (failures.length > 0) {
  console.log(`  Failed: ${failures.join(', ')}`);
  process.exit(1);
}
