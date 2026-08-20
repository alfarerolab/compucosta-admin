#!/usr/bin/env node
// Start helper that registers ts-node and tsconfig-paths then loads the TS worker
try {
  require('ts-node').register({ transpileOnly: true });
  require('tsconfig-paths/register');
  require('./billingWorker.ts');
} catch (err) {
  console.error('Failed to start billing worker:', err);
  process.exit(1);
}
