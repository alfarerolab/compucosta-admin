// ecosystem.config.js
//
// Configuración PM2 para producción.
//
// Procesos:
//   admin-compucosta  — Servidor Next.js
//   socket-server     — Servidor WebSocket
//   erp-sync-cron     — Trigger del ciclo ERP → BD → Shopify cada 7 horas
//
// BILLING:
// El cron de reconciliación y la cola de facturación viven en admin-compucosta.
// instrumentation.ts llama startBillingCron() al arrancar.
// Los webhooks de Shopify utilizan esa misma cola.
//
// SYNC-04:
// erp-sync-cron es el ÚNICO trigger del ciclo de sincronización.
// syncScheduler.ts dentro de Next.js NO utiliza setInterval.
//

module.exports = {
  apps: [

    // =========================================================
    // NEXT.JS
    // =========================================================
    {
      name: 'admin-compucosta',

      script: './node_modules/next/dist/bin/next',
      args: 'start',

      // Directorio real del proyecto en la VPS
      cwd: '/var/www/admin',

      exec_mode: 'fork',
      instances: 1,

      autorestart: true,
      watch: false,

      max_memory_restart: '1G',

      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOST: '0.0.0.0',

        // Billing corre dentro de este proceso
        BILLING_RUN_IN_PROCESS: 'true',
      },

      error_file: '/var/www/admin/logs/app-error.log',
      out_file: '/var/www/admin/logs/app-out.log',

      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },

    // =========================================================
    // SOCKET SERVER
    // =========================================================
    {
      name: 'socket-server',

      script: 'socket-server.js',

      // Directorio real del proyecto
      cwd: '/var/www/admin',

      exec_mode: 'fork',
      instances: 1,

      autorestart: true,
      watch: false,

      env: {
        NODE_ENV: 'production',
        SOCKET_PORT: 3001,
      },

      error_file: '/var/www/admin/logs/socket-error.log',
      out_file: '/var/www/admin/logs/socket-out.log',

      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },

    // =========================================================
    // ERP SYNC CRON
    // =========================================================
    {
      name: 'erp-sync-cron',

      // Script REAL del sincronizador
      script: '/var/www/admin/scripts/erp-sync-trigger.js',

      // Directorio real del proyecto
      cwd: '/var/www/admin',

      exec_mode: 'fork',
      instances: 1,

      // El script se ejecuta, dispara el ciclo y termina.
      // PM2 vuelve a lanzarlo según cron_restart.
      autorestart: false,

      watch: false,

      // Cada 7 horas
      cron_restart: '0 */7 * * *',

      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      error_file: '/var/www/admin/logs/erp-sync-error.log',
      out_file: '/var/www/admin/logs/erp-sync-out.log',

      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};