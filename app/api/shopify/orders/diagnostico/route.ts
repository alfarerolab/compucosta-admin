// app/api/shopify/orders/diagnostico/route.ts
// 🔍 Endpoint de diagnóstico para verificar configuración del ERP

import { NextRequest, NextResponse } from "next/server";

const ERP_API_URL = "https://ws.dsnube.co/api/v1";
const ERP_USERNAME = process.env.EXTERNAL_API_USERNAME;
const ERP_PASSWORD = process.env.EXTERNAL_API_PASSWORD;
const ERP_PREFIJO_FACTURA = process.env.ERP_PREFIJO_FACTURA || "FEF";
const ERP_IDSUC = parseInt(process.env.ERP_IDSUC || "1");

export async function GET(request: NextRequest) {
  console.log("\n" + "=".repeat(70));
  console.log("🔍 DIAGNÓSTICO DE CONEXIÓN AL ERP");
  console.log("=".repeat(70) + "\n");

  const diagnostico: any = {
    timestamp: new Date().toISOString(),
    configuracion: {
      erp_url: ERP_API_URL,
      username: ERP_USERNAME ? `${ERP_USERNAME.substring(0, 3)}***` : "❌ NO CONFIGURADO",
      password: ERP_PASSWORD ? "***" + ERP_PASSWORD.substring(ERP_PASSWORD.length - 3) : "❌ NO CONFIGURADO",
      prefijo: ERP_PREFIJO_FACTURA,
      sucursal: ERP_IDSUC,
    },
    pruebas: {}
  };

  // Verificar variables de entorno
  if (!ERP_USERNAME || !ERP_PASSWORD) {
    console.error("❌ Credenciales no configuradas");
    diagnostico.error = "Las variables EXTERNAL_API_USERNAME y/o EXTERNAL_API_PASSWORD no están configuradas";
    return NextResponse.json(diagnostico, { status: 500 });
  }

  const credentials = Buffer.from(`${ERP_USERNAME}:${ERP_PASSWORD}`).toString("base64");

  // PRUEBA 1: Conectividad básica
  console.log("🧪 PRUEBA 1: Conectividad básica al ERP");
  try {
    const response = await fetch(`${ERP_API_URL}/`, {
      method: "GET",
      headers: {
        Authorization: `Basic ${credentials}`,
      }
    });

    diagnostico.pruebas.conectividad = {
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type'),
      ok: response.ok
    };

    console.log(`   Status: ${response.status}`);
    console.log(`   Content-Type: ${response.headers.get('content-type')}`);

  } catch (error) {
    diagnostico.pruebas.conectividad = {
      error: error instanceof Error ? error.message : "Error desconocido"
    };
    console.error(`   ❌ Error:`, error);
  }

  // PRUEBA 2: Endpoint consultasql - Verificar último número de factura
  console.log("\n🧪 PRUEBA 2: Endpoint consultasql (Último número de factura)");
  try {
    const consulta = `SELECT MAX(numero) as ultimo_numero FROM trfacturas WHERE idsuc = ${ERP_IDSUC} AND prefijo = '${ERP_PREFIJO_FACTURA}'`;
    const url = `${ERP_API_URL}/consultasql?consulta=${encodeURIComponent(consulta)}&limite=1`;
    
    console.log(`   URL: ${url}`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      }
    });

    const contentType = response.headers.get('content-type');
    let responseData: any = null;
    let responseText = "";

    if (contentType && contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseText = await response.text();
    }

    diagnostico.pruebas.consultasql = {
      status: response.status,
      statusText: response.statusText,
      contentType: contentType,
      ok: response.ok,
      esJSON: contentType?.includes('application/json'),
      respuesta: responseData || responseText.substring(0, 200)
    };

    console.log(`   Status: ${response.status}`);
    console.log(`   Content-Type: ${contentType}`);
    console.log(`   Es JSON: ${contentType?.includes('application/json')}`);
    
    if (responseData) {
      console.log(`   Datos:`, JSON.stringify(responseData));
    } else {
      console.log(`   Respuesta (texto):`, responseText.substring(0, 200));
    }

  } catch (error) {
    diagnostico.pruebas.consultasql = {
      error: error instanceof Error ? error.message : "Error desconocido"
    };
    console.error(`   ❌ Error:`, error);
  }

  // PRUEBA 3: Consultar tercero usando consultasql (método confiable)
  console.log("\n🧪 PRUEBA 3: Consulta de tercero vía consultasql");
  try {
    const testNit = 92529884; // NIT de prueba que sabemos que existe
    const consulta = `SELECT nit, razonsocial, cupocreditocc, plazopagocc FROM materceros WHERE nit = ${testNit}`;
    const url = `${ERP_API_URL}/consultasql?consulta=${encodeURIComponent(consulta)}&limite=1`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      }
    });

    const contentType = response.headers.get('content-type');
    let responseData: any = null;
    let responseText = "";

    if (contentType && contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseText = await response.text();
    }

    diagnostico.pruebas.consultaTercero = {
      status: response.status,
      statusText: response.statusText,
      contentType: contentType,
      ok: response.ok,
      esJSON: contentType?.includes('application/json'),
      terceroEncontrado: responseData?.success && responseData?.result?.length > 0,
      respuesta: responseData || responseText.substring(0, 200)
    };

    console.log(`   Status: ${response.status}`);
    console.log(`   Tercero encontrado: ${responseData?.success && responseData?.result?.length > 0}`);
    
  } catch (error) {
    diagnostico.pruebas.consultaTercero = {
      error: error instanceof Error ? error.message : "Error desconocido"
    };
    console.error(`   ❌ Error:`, error);
  }

  // PRUEBA 4: Endpoint tercero (OPCIONAL - conocido por tener problemas)
  console.log("\n🧪 PRUEBA 4: Endpoint /tercero (opcional)");
  try {
    const testNit = 92529884;
    const response = await fetch(`${ERP_API_URL}/tercero?nit=${testNit}`, {
      method: "GET",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      }
    });

    const contentType = response.headers.get('content-type');
    let responseData: any = null;
    let responseText = "";

    if (contentType && contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseText = await response.text();
    }

    diagnostico.pruebas.terceroEndpoint = {
      status: response.status,
      statusText: response.statusText,
      contentType: contentType,
      ok: response.ok,
      esJSON: contentType?.includes('application/json'),
      respuesta: responseData || responseText.substring(0, 200),
      nota: "Este endpoint puede fallar, usar consultasql como alternativa"
    };

    console.log(`   Status: ${response.status}`);
    console.log(`   Content-Type: ${contentType}`);
    
  } catch (error) {
    diagnostico.pruebas.terceroEndpoint = {
      error: error instanceof Error ? error.message : "Error desconocido",
      nota: "Este endpoint puede fallar, usar consultasql como alternativa"
    };
    console.error(`   ❌ Error:`, error);
  }

  console.log("\n" + "=".repeat(70));
  console.log("✅ DIAGNÓSTICO COMPLETADO");
  console.log("=".repeat(70) + "\n");

  // Evaluar resultado general (solo pruebas críticas)
  const pruebasCriticasOK = 
    diagnostico.pruebas.conectividad?.ok &&
    diagnostico.pruebas.consultasql?.ok &&
    diagnostico.pruebas.consultasql?.esJSON &&
    diagnostico.pruebas.consultaTercero?.ok &&
    diagnostico.pruebas.consultaTercero?.esJSON;

  diagnostico.resumen = {
    estado: pruebasCriticasOK ? "✅ CONFIGURACIÓN CORRECTA" : "⚠️ HAY PROBLEMAS",
    recomendaciones: []
  };

  // Recomendaciones basadas en pruebas críticas
  if (!diagnostico.pruebas.conectividad?.ok) {
    diagnostico.resumen.recomendaciones.push("❌ No hay conectividad con el ERP. Verifica la URL y las credenciales.");
  }

  if (diagnostico.pruebas.consultasql && !diagnostico.pruebas.consultasql.esJSON) {
    diagnostico.resumen.recomendaciones.push("❌ El endpoint /consultasql devuelve HTML en lugar de JSON. Verifica las credenciales y permisos.");
  }

  if (!diagnostico.pruebas.consultasql?.ok) {
    diagnostico.resumen.recomendaciones.push("⚠️ El endpoint /consultasql no responde correctamente. Verifica que la tabla 'trfacturas' exista.");
  }

  if (!diagnostico.pruebas.consultaTercero?.ok) {
    diagnostico.resumen.recomendaciones.push("❌ No se pueden consultar terceros. Verifica que la tabla 'materceros' exista.");
  }

  if (!diagnostico.pruebas.consultaTercero?.terceroEncontrado) {
    diagnostico.resumen.recomendaciones.push("⚠️ El NIT de prueba no existe en la base de datos. Esto no es crítico.");
  }

  // Advertencia informativa sobre endpoint /tercero
  if (!diagnostico.pruebas.terceroEndpoint?.ok) {
    diagnostico.resumen.recomendaciones.push("ℹ️ El endpoint /tercero no funciona correctamente, pero no es crítico. Se usará /consultasql como alternativa.");
  }

  // Mensaje de éxito solo si todas las pruebas críticas pasaron
  if (pruebasCriticasOK) {
    diagnostico.resumen.recomendaciones.push("✅ Todas las pruebas críticas pasaron correctamente. El sistema está listo para funcionar.");
  }

  return NextResponse.json(diagnostico, { 
    status: pruebasCriticasOK ? 200 : 500 
  });
}