// C:/admin/cron-worker.js
const cron = require('node-cron');

// ✅ USAR LOCALHOST en producción para evitar problemas de NGINX/SSL
const APP_URL = process.env.NODE_ENV === 'production' 
  ? `http://localhost:${process.env.PORT || 3000}` 
  : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

const SHOPIFY_SYNC_SECRET = process.env.SHOPIFY_SYNC_SECRET;

// ✅ VALIDAR que el secreto esté configurado al iniciar
if (!SHOPIFY_SYNC_SECRET) {
  console.error('❌ ERROR CRÍTICO: SHOPIFY_SYNC_SECRET no está configurado');
  console.error('   Por favor configura esta variable de entorno antes de continuar');
  process.exit(1);
}

console.log('\n' + '='.repeat(70));
console.log('🚀 WORKER DE CRON JOBS INICIADO');
console.log('='.repeat(70));
console.log(`📍 URL de la aplicación: ${APP_URL}`);
console.log(`🔒 Secreto configurado: ${SHOPIFY_SYNC_SECRET ? '✅ Sí' : '❌ No'}`);
console.log(`🕐 Hora de inicio: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`);
console.log('='.repeat(70) + '\n');

// ⏰ Sincronización de productos ERP cada 7 horas (00:00, 07:00, 14:00, 21:00)
const productsSyncJob = cron.schedule('0 */7 * * *', async () => {
  console.log('\n' + '='.repeat(70));
  console.log('⏰ [CRON PRODUCTOS ERP] Iniciando sincronización automática');
  console.log(`   Hora: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`);
  console.log('='.repeat(70));

  try {
    const response = await fetch(`${APP_URL}/api/products/sync`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        'x-cron-job': 'true'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    console.log('✅ [CRON PRODUCTOS ERP] Sincronización completada exitosamente');
    console.log(`   Productos sincronizados: ${data.estadisticas?.productos?.sincronizados || 0}`);
    console.log('='.repeat(70) + '\n');

  } catch (error) {
    console.error('❌ [CRON PRODUCTOS ERP] Error en sincronización:');
    console.error(error);
    console.error('='.repeat(70) + '\n');
  }
}, {
  timezone: "America/Bogota"
});

console.log('✅ Cron job de PRODUCTOS ERP configurado');
console.log('   Frecuencia: Cada 7 horas');
console.log('   Horarios: 00:00, 07:00, 14:00, 21:00\n');

// ⏰ Sincronización de Shopify cada 5 horas (00:00, 05:00, 10:00, 15:00, 20:00)
const shopifySyncJob = cron.schedule('0 */5 * * *', async () => {
  console.log('\n' + '='.repeat(70));
  console.log('⏰ [CRON SHOPIFY] Iniciando sincronización automática');
  console.log(`   Hora: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`);
  console.log('='.repeat(70));

  try {
    if (!SHOPIFY_SYNC_SECRET) {
      throw new Error('SHOPIFY_SYNC_SECRET no está configurado');
    }

    // ✅ USAR EL PROXY /api/shopify/client que bypasea NGINX
    const response = await fetch(`${APP_URL}/api/shopify/client`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-job': 'true'
      },
      body: JSON.stringify({ force: false })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    console.log('✅ [CRON SHOPIFY] Sincronización iniciada correctamente');
    console.log(`   Modo: ${data.modo || 'inteligente'}`);
    console.log('='.repeat(70) + '\n');

  } catch (error) {
    console.error('❌ [CRON SHOPIFY] Error en sincronización:');
    console.error(error);
    console.error('='.repeat(70) + '\n');
  }
}, {
  timezone: "America/Bogota"
});

console.log('✅ Cron job de SHOPIFY configurado');
console.log('   Frecuencia: Cada 5 horas');
console.log('   Horarios: 00:00, 05:00, 10:00, 15:00, 20:00\n');

// 🔄 Sincronización inicial después de 3 minutos del arranque
setTimeout(async () => {
  console.log('\n🔄 [INICIAL] Ejecutando primera sincronización de productos ERP...\n');
  
  try {
    const response = await fetch(`${APP_URL}/api/products/sync`, {
      method: 'GET',
      headers: { 
        'Cache-Control': 'no-cache',
        'x-cron-job': 'true' 
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ [INICIAL] Primera sincronización ERP completada');
      console.log(`   Productos sincronizados: ${data.estadisticas?.productos?.sincronizados || 0}\n`);
    } else {
      console.log('⚠️ [INICIAL] Error en primera sincronización, se reintentará en el próximo ciclo\n');
    }
  } catch (error) {
    console.error('❌ [INICIAL] Error en primera sincronización:', error, '\n');
  }
}, 3 * 60 * 1000); // 3 minutos

console.log('🎉 Sistema de cron jobs ACTIVO y esperando...\n');
console.log('📋 Resumen de configuración:');
console.log('   • Productos ERP: Cada 7 horas (00:00, 07:00, 14:00, 21:00)');
console.log('   • Shopify Sync: Cada 5 horas (00:00, 05:00, 10:00, 15:00, 20:00)');
console.log('   • Pedidos: Manejados por WEBHOOKS (tiempo real)');
console.log('   • Primera sync: En 3 minutos\n');

// Manejar cierre limpio
process.on('SIGTERM', () => {
  console.log('\n⚠️ Recibida señal SIGTERM - Cerrando cron jobs...');
  productsSyncJob.stop();
  shopifySyncJob.stop();
  console.log('✅ Cron jobs detenidos correctamente');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n⚠️ Recibida señal SIGINT (Ctrl+C) - Cerrando cron jobs...');
  productsSyncJob.stop();
  shopifySyncJob.stop();
  console.log('✅ Cron jobs detenidos correctamente');
  process.exit(0);
});

// Mantener el proceso vivo
process.stdin.resume();