// Agente de nombres comerciales con DeepSeek (API compatible con OpenAI).
// Convierte el nombre interno del ERP ("PORT LEN IP3 R5 8G 512") en un nombre claro
// para el cliente que incluya las características clave del producto.

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const REQUEST_TIMEOUT_MS = 30_000;

export const NOMBRE_COMERCIAL_MAX = 150;

export interface ProductoParaNombre {
  idproducto: string;
  nombreproducto: string;
  marca_texto?: string | null;
  categorias_texto?: string | null;
  descripcion?: string | null;
  caracteristica?: string | null;
}

export interface NombreComercialResult {
  nombre_comercial: string;
  /** Características que el agente usó, para que el admin las revise */
  caracteristicas_usadas: string[];
}

export class DeepSeekError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
    this.name = "DeepSeekError";
  }
}

export function isDeepSeekConfigured() {
  return !!process.env.DEEPSEEK_API_KEY;
}

const SYSTEM_PROMPT = `Eres el redactor de catálogo de "Computadores de la Costa", tienda colombiana de tecnología.
Tu tarea: crear el NOMBRE COMERCIAL de un producto, que es el título que verán los clientes en la tienda online.

Reglas:
- Español de Colombia, claro y profesional. Sin emojis, sin signos de exclamación, sin MAYÚSCULAS sostenidas.
- Estructura: [Tipo de producto] [Marca] [Modelo/serie] + características clave separadas por comas o " - ".
  Ejemplo: "Portátil Lenovo IdeaPad 3 15.6\\" AMD Ryzen 5 7520U, 8 GB RAM, 512 GB SSD, Windows 11"
  Ejemplo: "Impresora Multifuncional Epson EcoTank L3250 Wi-Fi, Tinta Continua"
- Incluye las especificaciones que más pesan en la compra (procesador, RAM, almacenamiento, tamaño de pantalla,
  capacidad, conectividad, potencia, etc.) según el tipo de producto.
- Expande abreviaturas del ERP (PORT → Portátil, IMP → Impresora, MON → Monitor, "8G" → "8 GB", etc.).
- Usa SOLO datos presentes en la información recibida. NUNCA inventes especificaciones, modelos ni cifras.
  Si un dato es ambiguo, omítelo.
- Máximo ${NOMBRE_COMERCIAL_MAX} caracteres. Unidades con espacio ("8 GB", "1 TB", "27 pulgadas" o 27").
- No incluyas precio, garantía, código interno, SKU ni palabras como "oferta", "nuevo" u "original".

Responde únicamente con JSON válido con esta forma:
{"nombre_comercial": "string", "caracteristicas_usadas": ["string", ...]}`;

const limpiar = (v?: string | null, max = 1500) => (v || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

function construirMensajeUsuario(p: ProductoParaNombre) {
  const lineas = [
    `Nombre interno ERP: ${p.nombreproducto}`,
    p.marca_texto && `Marca: ${p.marca_texto}`,
    p.categorias_texto && `Categoría: ${p.categorias_texto}`,
    p.caracteristica && `Características técnicas (clave: valor):\n${(p.caracteristica || "").trim().slice(0, 2000)}`,
    p.descripcion && `Descripción: ${limpiar(p.descripcion)}`,
  ].filter(Boolean);
  return `Genera el nombre comercial en JSON para este producto:\n\n${lineas.join("\n")}`;
}

export async function generarNombreComercial(producto: ProductoParaNombre): Promise<NombreComercialResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new DeepSeekError("DEEPSEEK_API_KEY no está configurada en el servidor", 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        temperature: 0.3,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: construirMensajeUsuario(producto) },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === "AbortError") throw new DeepSeekError("DeepSeek no respondió a tiempo", 504);
    throw new DeepSeekError(`No se pudo contactar a DeepSeek: ${err?.message || err}`, 502);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    const status = res.status === 429 ? 429 : res.status === 401 ? 503 : 502;
    const mensaje =
      res.status === 401 ? "La API key de DeepSeek no es válida" :
      res.status === 402 ? "La cuenta de DeepSeek no tiene saldo" :
      res.status === 429 ? "Límite de peticiones de DeepSeek alcanzado; intenta en unos segundos" :
      `DeepSeek respondió ${res.status}`;
    console.error("❌ [deepseek]", res.status, detalle.slice(0, 500));
    throw new DeepSeekError(mensaje, status);
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new DeepSeekError("DeepSeek devolvió una respuesta no válida", 502);
  }

  let nombre = String(parsed?.nombre_comercial ?? "").replace(/\s+/g, " ").trim();
  // Quitar comillas envolventes, pero no la de pulgadas al final (Monitor 27")
  if (/^".*"$/.test(nombre) && !/\d"$/.test(nombre)) nombre = nombre.slice(1, -1).trim();
  nombre = nombre.slice(0, NOMBRE_COMERCIAL_MAX);

  if (!nombre) {
    throw new DeepSeekError("DeepSeek no generó un nombre comercial", 502);
  }

  return {
    nombre_comercial: nombre,
    caracteristicas_usadas: Array.isArray(parsed?.caracteristicas_usadas)
      ? parsed.caracteristicas_usadas.map(String).slice(0, 12)
      : [],
  };
}
