// lib/sync-scheduler.ts
// Servicio que ejecuta /api/shopify/sync-products cada 6 horas
// Sincroniza: BD local → Shopify

class SyncScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private syncInProgress: boolean = false;

  // ⏰ Configuración: cada 6 horas
  private readonly SYNC_INTERVAL = 6 * 60 * 60 * 1000; // 6 horas en milisegundos
  
  // Si quieres cambiar la frecuencia:
  // 2 horas: 2 * 60 * 60 * 1000
  // 4 horas: 4 * 60 * 60 * 1000
  // 12 horas: 12 * 60 * 60 * 1000

  private readonly API_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  constructor() {
    console.log('🔄 Servicio de sincronización automática inicializado');
  }

  // Iniciar el servicio automático
  start() {
    if (this.isRunning) {
      console.log('⚠️ El servicio ya está corriendo');
      return;
    }

    console.log('✅ ========================================');
    console.log('✅ Servicio de sincronización BD → Shopify ACTIVADO');
    console.log(`✅ Frecuencia: cada ${this.SYNC_INTERVAL / 1000 / 60 / 60} horas`);
    console.log('✅ ========================================');

    // ⚠️ Descomentar esta línea si quieres sincronizar INMEDIATAMENTE al iniciar
    // this.executeSyncNow();

    // Programar ejecuciones cada 6 horas
    this.intervalId = setInterval(() => {
      this.executeSyncNow();
    }, this.SYNC_INTERVAL);

    this.isRunning = true;

    const proximaSincro = new Date(Date.now() + this.SYNC_INTERVAL);
    console.log('⏰ Próxima sincronización:', proximaSincro.toLocaleString('es-CO'));
  }

  // Detener el servicio
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      console.log('🛑 Servicio de sincronización detenido');
    }
  }

  // Ejecutar sincronización BD → Shopify
  async executeSyncNow() {
    if (this.syncInProgress) {
      console.log('⏳ Sincronización ya en progreso, saltando...');
      return;
    }

    this.syncInProgress = true;

    try {
      console.log('⏰ ========================================');
      console.log('⏰ Iniciando sincronización BD → Shopify');
      console.log('⏰ Fecha:', new Date().toISOString());
      console.log('⏰ ========================================');

      // Llamar al endpoint de sincronización BD → Shopify
      const response = await fetch(`${this.API_URL}/api/shopify/sync-products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(600000) // 10 minutos timeout (puede tardar con muchos productos)
      });

      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }

      const resultado = await response.json();

      console.log('✅ ========================================');
      console.log('✅ Sincronización BD → Shopify completada');
      console.log('✅ Total productos:', resultado.estadisticas?.total || 0);
      console.log('✅ Productos creados:', resultado.estadisticas?.creados || 0);
      console.log('✅ Productos actualizados:', resultado.estadisticas?.actualizados || 0);
      console.log('✅ Errores:', resultado.estadisticas?.errores || 0);
      console.log('✅ Fecha fin:', new Date().toISOString());
      console.log('✅ ========================================');

      // Calcular próxima ejecución
      const nextRun = new Date(Date.now() + this.SYNC_INTERVAL);
      console.log('⏰ Próxima sincronización:', nextRun.toLocaleString('es-CO'));

    } catch (error) {
      console.error('❌ ========================================');
      console.error('❌ Error en sincronización BD → Shopify');
      console.error('❌ Error:', error);
      console.error('❌ Fecha:', new Date().toISOString());
      console.error('❌ ========================================');
    } finally {
      this.syncInProgress = false;
    }
  }

  // Obtener estado del servicio
  getStatus() {
    return {
      isRunning: this.isRunning,
      syncInProgress: this.syncInProgress,
      intervalHours: this.SYNC_INTERVAL / 1000 / 60 / 60,
      endpoint: '/api/shopify/sync-products',
      nextRun: this.intervalId 
        ? new Date(Date.now() + this.SYNC_INTERVAL).toISOString() 
        : null
    };
  }
}

// Singleton: Una sola instancia para toda la app
let schedulerInstance: SyncScheduler | null = null;

export function getSyncScheduler(): SyncScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new SyncScheduler();
  }
  return schedulerInstance;
}

export default SyncScheduler;