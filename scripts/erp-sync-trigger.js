// scripts/erp-sync-trigger.js
// Script plain Node.js — sin ts-node, sin aliases @/
// PM2 lo ejecuta cada 7 horas (cron_restart) para disparar el ciclo ERP → BD → Shopify.
// Llama al endpoint interno de Next.js; la cola corre en el proceso admin-compucosta.

require('dotenv').config({
  path: '/var/www/admin/.env',
});

const http = require('http');

const PORT   = process.env.PORT          || 3000;
const SECRET = process.env.CRON_SECRET;

if (!SECRET) {
  console.error('❌ [erp-sync-trigger] CRON_SECRET no configurado — abortando');
  process.exit(1);
}

const body = JSON.stringify({});
const options = {
  hostname: '127.0.0.1',
  port: PORT,
  path: '/api/cron/erp-sync',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Authorization': `Bearer ${SECRET}`,
  },
};

console.log(`🚀 [erp-sync-trigger] Disparando ciclo ERP-sync — ${new Date().toISOString()}`);

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log(`✅ [erp-sync-trigger] Encolado correctamente — ${data}`);
      process.exit(0);
    } else {
      console.error(`❌ [erp-sync-trigger] Respuesta inesperada ${res.statusCode}: ${data}`);
      process.exit(1);
    }
  });
});

req.on('error', (err) => {
  console.error(`❌ [erp-sync-trigger] Error de conexión: ${err.message}`);
  process.exit(1);
});

req.write(body);
req.end();
