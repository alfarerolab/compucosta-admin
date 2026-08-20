#!/usr/bin/env tsx
/**
 * test-numero-factura.ts
 *
 * Prueba la función obtenerSiguienteNumero():
 *   1. Consulta el MAX(numero) en el ERP remoto (trfacturas)
 *   2. Consulta el consecutivo local (consecutivo_factura)
 *   3. Asigna el siguiente número (max de ambos + 1)
 *
 * Ejecutar: npx tsx scripts/test-numero-factura.ts
 *
 * NO crea ninguna factura real — solo verifica y muestra el próximo número.
 */

import dotenv from 'dotenv';
dotenv.config();

import { createRequire } from 'module';
const req = createRequire(import.meta.url);
const { prisma } = req('../lib/prisma');

const ERP_API_URL       = process.env.ERP_API_URL || 'https://ws.dsnube.co/api/v1';
const ERP_USERNAME      = process.env.EXTERNAL_API_USERNAME || '';
const ERP_PASSWORD      = process.env.EXTERNAL_API_PASSWORD || '';
const ERP_PREFIJO       = process.env.ERP_PREFIJO_FACTURA || 'FEF';
const ERP_IDSUC         = parseInt(process.env.ERP_IDSUC || '1');

async function consultarUltimoNumeroERP(): Promise<number> {
  const credentials = Buffer.from(`${ERP_USERNAME}:${ERP_PASSWORD}`).toString('base64');
  const sql = `SELECT MAX(numero) AS numero FROM trfacturas WHERE idsuc = ${ERP_IDSUC} AND prefijo = '${ERP_PREFIJO}'`;
  const encoded = encodeURIComponent(sql);
  const url = `${ERP_API_URL}/consultasql?consulta=${encoded}`;

  console.log(`\n🔗 Consultando ERP: ${ERP_API_URL}/consultasql`);
  console.log(`   SQL: ${sql}`);

  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`ERP respondió ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const numero = data?.result?.[0]?.numero ? Number(data.result[0].numero) : 0;
  return numero;
}

async function consultarConsecutivoLocal(): Promise<{ id: number; ultimo_numero: number } | null> {
  const reg = await (prisma as any).consecutivo_factura.findFirst({
    where: { prefijo: ERP_PREFIJO },
    orderBy: { id: 'desc' },
  });
  return reg ?? null;
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🔢 TEST: Verificación de número de factura siguiente');
  console.log(`   Prefijo: ${ERP_PREFIJO}  |  Sucursal: ${ERP_IDSUC}`);
  console.log('='.repeat(70));

  // ── 1. Consultar ERP remoto ──────────────────────────────────────────────
  console.log('\n📡 PASO 1: Consultando último número en el ERP remoto...');
  let ultimoERP = 0;
  try {
    ultimoERP = await consultarUltimoNumeroERP();
    console.log(`   ✅ Último número en ERP: ${ultimoERP}`);
  } catch (e: any) {
    console.warn(`   ⚠️ No se pudo consultar el ERP: ${e.message}`);
    console.warn('      Se usará solo el consecutivo local.');
  }

  // ── 2. Consultar consecutivo local ────────────────────────────────────────
  console.log('\n🗄️  PASO 2: Consultando consecutivo local (consecutivo_factura)...');
  const regLocal = await consultarConsecutivoLocal();
  if (regLocal) {
    console.log(`   ✅ Registro local encontrado → ultimo_numero: ${regLocal.ultimo_numero} (id=${regLocal.id})`);
  } else {
    console.log('   ℹ️  No existe registro local todavía — se creará con el siguiente número.');
  }

  // ── 3. Calcular siguiente número ──────────────────────────────────────────
  const baseLocal = regLocal?.ultimo_numero ?? 0;
  const base      = Math.max(baseLocal, ultimoERP);
  const siguiente = base + 1;

  console.log('\n🧮 PASO 3: Cálculo del siguiente número:');
  console.log(`   Último ERP local  : ${baseLocal}`);
  console.log(`   Último ERP remoto : ${ultimoERP}`);
  console.log(`   Base (máximo)     : ${base}`);
  console.log(`   ✅ SIGUIENTE NÚMERO: ${siguiente}  →  ${ERP_PREFIJO}-${siguiente}`);

  // ── 4. Simular llamada a obtenerSiguienteNumero() sin modificar nada ──────
  console.log('\n📋 PASO 4: Simulación de obtenerSiguienteNumero() (sin escribir en BD)...');
  console.log('   La función real haría:');
  console.log(`   1. SELECT MAX(numero) FROM trfacturas WHERE idsuc=${ERP_IDSUC} AND prefijo='${ERP_PREFIJO}' → ${ultimoERP}`);
  console.log(`   2. SELECT * FROM consecutivo_factura WHERE prefijo='${ERP_PREFIJO}' FOR UPDATE → ultimo_numero=${baseLocal}`);
  console.log(`   3. UPDATE consecutivo_factura SET ultimo_numero=${siguiente}`);
  console.log(`   4. Retorna: ${siguiente}`);

  // ── Resumen ───────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(70));
  console.log('📊 RESUMEN');
  console.log('='.repeat(70));
  console.log(`   Último número registrado (ERP)  : ${ultimoERP || '(sin registros)'}`);
  console.log(`   Último número local (BD)         : ${baseLocal || '(sin registro)'}`);
  console.log(`   ▶ Próxima factura asignará: ${ERP_PREFIJO}-${siguiente}`);
  console.log('='.repeat(70) + '\n');

  await (prisma as any).$disconnect();
}

main().catch((e) => {
  console.error('❌ Error:', e);
  (prisma as any).$disconnect().finally(() => process.exit(1));
});
