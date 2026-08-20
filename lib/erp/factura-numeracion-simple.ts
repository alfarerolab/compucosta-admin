// lib/erp/factura-numeracion-simple.ts
// 🔢 Sistema SIMPLIFICADO de numeración consecutiva

import prisma from "../prismadb";

interface NumeroFactura {
  numero: number;
  prefijo: string;
  idsuc: number;
  documento_completo: string;
}

/**
 * 🎯 Obtener siguiente número de factura (VERSIÓN SIMPLE)
 * Consulta el último número y suma 1
 */
export async function obtenerSiguienteNumeroFactura(
  prefijo: string = "FEF",
  idsuc: number = 1
): Promise<NumeroFactura> {
  
  console.log(`🔢 Consultando último número para ${prefijo}-SUC${idsuc}...`);

  // 1️⃣ Consultar último número usado
  const ultimaFactura = await prisma.$queryRaw<Array<{ numero: number | null }>>`
    SELECT TOP 1 numero 
    FROM trfacturas 
    WHERE prefijo = ${prefijo} 
      AND idsuc = ${idsuc}
    ORDER BY numero DESC
  `;

  let siguienteNumero = 1;

  if (ultimaFactura && ultimaFactura.length > 0 && ultimaFactura[0].numero !== null) {
    siguienteNumero = ultimaFactura[0].numero + 1;
    console.log(`✅ Último número: ${ultimaFactura[0].numero}, siguiente: ${siguienteNumero}`);
  } else {
    // Si no hay facturas, comenzar desde la resolución DIAN
    const resolucion = await prisma.$queryRaw<Array<{ desde: number }>>`
      SELECT desde 
      FROM maresolucionfactura 
      WHERE prefijo = ${prefijo} 
        AND idsuc = ${idsuc}
        AND activo = 1
    `;

    if (resolucion && resolucion.length > 0) {
      siguienteNumero = resolucion[0].desde;
      console.log(`✅ Primera factura, comenzando desde: ${siguienteNumero}`);
    } else {
      console.log(`⚠️ No hay resolución activa, comenzando desde: 1`);
    }
  }

  // 2️⃣ Validar contra resolución DIAN (opcional pero recomendado)
  const resolucion = await prisma.$queryRaw<Array<{ desde: number; hasta: number }>>`
    SELECT desde, hasta 
    FROM maresolucionfactura 
    WHERE prefijo = ${prefijo} 
      AND idsuc = ${idsuc}
      AND activo = 1
  `;

  if (resolucion && resolucion.length > 0) {
    const { desde, hasta } = resolucion[0];
    
    if (siguienteNumero > hasta) {
      throw new Error(
        `❌ RESOLUCIÓN AGOTADA: El número ${siguienteNumero} excede el límite (${desde}-${hasta}). ` +
        `Debes habilitar una nueva resolución DIAN.`
      );
    }
    
    // Alerta si quedan pocos números
    const disponibles = hasta - siguienteNumero + 1;
    if (disponibles < 100) {
      console.warn(`⚠️ ADVERTENCIA: Solo quedan ${disponibles} números disponibles!`);
    }
  }

  const resultado = {
    numero: siguienteNumero,
    prefijo: prefijo,
    idsuc: idsuc,
    documento_completo: `${prefijo}${siguienteNumero}`
  };

  console.log(`✅ Número generado: ${resultado.documento_completo}`);
  return resultado;
}

/**
 * 📊 Verificar disponibilidad de números (útil para monitoreo)
 */
export async function verificarDisponibilidad(
  prefijo: string = "FEF",
  idsuc: number = 1
): Promise<{
  ultimo_usado: number | null;
  proximo: number;
  disponibles: number;
  rango: string;
}> {
  
  const resolucion = await prisma.$queryRaw<Array<{ desde: number; hasta: number }>>`
    SELECT desde, hasta 
    FROM maresolucionfactura 
    WHERE prefijo = ${prefijo} 
      AND idsuc = ${idsuc}
      AND activo = 1
  `;

  if (!resolucion || resolucion.length === 0) {
    throw new Error(`No se encontró resolución activa para ${prefijo}-SUC${idsuc}`);
  }

  const { desde, hasta } = resolucion[0];

  const ultimaFactura = await prisma.$queryRaw<Array<{ numero: number | null }>>`
    SELECT TOP 1 numero 
    FROM trfacturas 
    WHERE prefijo = ${prefijo} 
      AND idsuc = ${idsuc}
    ORDER BY numero DESC
  `;

  const ultimo = ultimaFactura?.[0]?.numero || null;
  const proximo = ultimo ? ultimo + 1 : desde;
  const disponibles = hasta - proximo + 1;

  return {
    ultimo_usado: ultimo,
    proximo: proximo,
    disponibles: disponibles,
    rango: `${desde}-${hasta}`
  };
}