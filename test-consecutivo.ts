// test-consecutivo.ts
// Script de prueba para verificar la obtención del consecutivo

import { obtenerSiguienteNumero } from './lib/facturacion-helpers';

/**
 * Script de prueba para verificar el funcionamiento del consecutivo híbrido
 * 
 * Ejecutar con:
 * npx ts-node test-consecutivo.ts
 * 
 * O agregar a package.json:
 * "scripts": {
 *   "test:consecutivo": "ts-node test-consecutivo.ts"
 * }
 */

async function testConsecutivo() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 INICIANDO TEST DE CONSECUTIVO HÍBRIDO');
  console.log('='.repeat(70) + '\n');

  try {
    // Test 1: Obtener consecutivo
    console.log('📋 Test 1: Obtener siguiente número de factura\n');
    const numero = await obtenerSiguienteNumero();
    console.log(`\n✅ Número obtenido exitosamente: ${numero}`);
    
    // Test 2: Verificar que es un número válido
    console.log('\n📋 Test 2: Validar número obtenido\n');
    if (typeof numero === 'number' && numero > 0) {
      console.log(`✅ Número válido: ${numero} (tipo: ${typeof numero})`);
    } else {
      console.error(`❌ Número inválido: ${numero} (tipo: ${typeof numero})`);
    }

    // Test 3: Obtener otro consecutivo (debe ser +1)
    console.log('\n📋 Test 3: Obtener segundo consecutivo\n');
    const numero2 = await obtenerSiguienteNumero();
    console.log(`\n✅ Segundo número obtenido: ${numero2}`);
    
    if (numero2 === numero + 1) {
      console.log(`✅ Consecutivo correcto: ${numero} → ${numero2}`);
    } else {
      console.warn(`⚠️  Consecutivo inesperado: ${numero} → ${numero2} (esperado: ${numero + 1})`);
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ TESTS COMPLETADOS');
    console.log('='.repeat(70) + '\n');

  } catch (error) {
    console.error('\n' + '='.repeat(70));
    console.error('❌ ERROR EN LOS TESTS');
    console.error('='.repeat(70));
    console.error('Error:', error instanceof Error ? error.message : error);
    console.error('Stack:', error instanceof Error ? error.stack : 'N/A');
    console.error('='.repeat(70) + '\n');
    process.exit(1);
  }
}

// Ejecutar tests
testConsecutivo()
  .then(() => {
    console.log('🎉 Script de prueba finalizado exitosamente');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Error fatal:', error);
    process.exit(1);
  });