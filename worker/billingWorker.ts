#!/usr/bin/env node
// Use CommonJS require to avoid ESM resolution issues when loaded via ts-node/register
const { startBillingCron } = require('../lib/billingCron');

function main() {
  console.log('[billingWorker] ▶ Iniciando worker de facturación (PM2)');
  try {
    startBillingCron();
  } catch (err) {
    console.error('[billingWorker] ❌ Error arrancando cron:', err);
    process.exit(1);
  }

  process.on('SIGINT', () => {
    console.log('[billingWorker] ⏹ SIGINT received — exiting');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    console.log('[billingWorker] ⏹ SIGTERM received — exiting');
    process.exit(0);
  });
}

main();
