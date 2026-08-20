import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";

// ─── Normalización de búsqueda ────────────────────────────────────────────────
// Cubre: tildes/acentos, mayúsculas, guiones y puntos, espacios en unidades
// (e.g. "16 gb" → "16gb"), y plurales simples en español.

/** Quita diacríticos, normaliza separadores y espacios, devuelve minúsculas. */
function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // strip tildes/acentos
    .replace(/[-./()[\]_]/g, " ")      // separadores → espacio
    .replace(/(\d)\s+(gb|mb|tb|ghz|mhz|mp|hz|w|kg|cm|mm|pulgadas?)/gi, "$1$2") // "16 gb" → "16gb"
    .replace(/\s+/g, " ")              // colapsar múltiples espacios
    .trim();
}

/** Devuelve variantes singular/plural para cubrir "mesas"↔"mesa", "computadores"↔"computador". */
function variantes(palabra: string): string[] {
  const vs = [palabra];
  if (palabra.endsWith("es") && palabra.length > 3) vs.push(palabra.slice(0, -2));
  else if (palabra.endsWith("s") && palabra.length > 2) vs.push(palabra.slice(0, -1));
  return vs;
}

/**
 * Construye condiciones Prisma para una búsqueda de texto tolerante.
 * Cada palabra del término debe aparecer en el nombre O en el idproducto.
 * El producto debe satisfacer TODAS las palabras (AND entre palabras, OR entre variantes).
 */
function condicionesBusqueda(search: string): Prisma.productoWhereInput[] {
  const palabras = normalizarTexto(search).split(" ").filter(Boolean);
  return palabras.map((palabra) => ({
    OR: variantes(palabra).flatMap((v) => [
      { nombreproducto: { contains: v } },
      { idproducto:     { contains: v } },
    ]),
  }));
}

function generarEtag(payload: unknown): string {
  const raw = JSON.stringify(payload);
  const hash = createHash("sha1").update(raw).digest("base64url");
  return `"${hash}"`;
}

function coincideIfNoneMatch(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === "*") return true;

  const candidatos = ifNoneMatch
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  return candidatos.some((candidate) => {
    const normalized = candidate.startsWith("W/") ? candidate.slice(2) : candidate;
    return normalized === etag;
  });
}

// ─── GET /api/products — paginación + filtros del lado del servidor ───────────
// Params de paginación:
//   page        (default 1)
//   limit       (default 50, máx 200)
// Params de filtro:
//   search      busca por palabras en nombreproducto e idproducto
//               · Tolerante a: tildes, mayúsculas, guiones, plurales simples
//               · Multi-palabra: todas las palabras deben estar presentes (AND)
//   visibilidad todos | visibles | ocultos
//   estado      todos | Completo | Incompleto | Sin completar
//   categoria   todos | sin_categoria | "Name" | "Parent → Child"
//   marca       todos | sin_marca | "Name"
//   precioMin / precioMax
//   cantidadMin / cantidadMax
// Respuesta:
//   { productos, total, page, limit, totalPages, hasMore }
// Cache:
//   Cache-Control: private, max-age=60

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    // ─── Paginación ──────────────────────────────────────────────────────────
    const page  = Math.max(1, parseInt(searchParams.get("page")  || "1",  10) || 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1), 200);
    const skip  = (page - 1) * limit;

    // ─── Filtros ─────────────────────────────────────────────────────────────
    const search      = (searchParams.get("search")      || "").trim();
    const visibilidad = searchParams.get("visibilidad")  || "todos";
    const estado      = searchParams.get("estado")       || "todos";
    const categoria   = searchParams.get("categoria")    || "todos";
    const marca       = searchParams.get("marca")        || "todos";
    const precioMin   = parseFloat(searchParams.get("precioMin") || "") || null;
    const precioMax   = parseFloat(searchParams.get("precioMax") || "") || null;
    const cantMin     = parseInt(searchParams.get("cantidadMin") || "", 10);
    const cantMax     = parseInt(searchParams.get("cantidadMax") || "", 10);
    const destacado   = searchParams.get("destacado");

    // ─── Construir where ─────────────────────────────────────────────────────
    const where: Prisma.productoWhereInput = {};
    const and: Prisma.productoWhereInput[] = [];

    // Búsqueda de texto — normalizada y multi-palabra
    if (search) {
      and.push(...condicionesBusqueda(search));
    }

    // Visibilidad
    if (visibilidad === "visibles") where.activo = true;
    else if (visibilidad === "ocultos") where.activo = false;
    else where.activo = true; // default: solo activos

    // Rangos de precio y stock
    if (precioMin !== null) and.push({ lista1: { gte: precioMin } });
    if (precioMax !== null) and.push({ lista1: { lte: precioMax } });
    if (!isNaN(cantMin))   and.push({ cantidad: { gte: cantMin } });
    if (!isNaN(cantMax))   and.push({ cantidad: { lte: cantMax } });

    // Estado (calculado desde descripcion + caracteristica + imagenes)
    if (estado === "Completo") {
      and.push(
        { descripcion:    { not: null } }, { descripcion:    { not: "" } },
        { caracteristica: { not: null } }, { caracteristica: { not: "" } },
        { imagenes: { some: {} } },
      );
    } else if (estado === "Sin completar") {
      and.push({ AND: [
        { OR: [{ descripcion: null },    { descripcion: "" }] },
        { OR: [{ caracteristica: null }, { caracteristica: "" }] },
        { imagenes: { none: {} } },
      ]});
    } else if (estado === "Incompleto") {
      // Tiene algo pero no todo
      and.push({ NOT: { AND: [
        { descripcion: { not: null } }, { descripcion: { not: "" } },
        { caracteristica: { not: null } }, { caracteristica: { not: "" } },
        { imagenes: { some: {} } },
      ]}});
      and.push({ NOT: { AND: [
        { OR: [{ descripcion: null },    { descripcion: "" }] },
        { OR: [{ caracteristica: null }, { caracteristica: "" }] },
        { imagenes: { none: {} } },
      ]}});
    }

    // Categoría
    if (categoria === "sin_categoria") {
      and.push({ categorias: { none: {} } });
    } else if (categoria !== "todos") {
      if (categoria.includes(" → ")) {
        const [parentName, childName] = categoria.split(" → ").map((s) => s.trim());
        and.push({ categorias: { some: { categoria: {
          nombre: childName,
          padre:  { nombre: parentName },
        }}}});
      } else {
        and.push({ categorias: { some: { categoria: { nombre: categoria } } } });
      }
    }

    // Marca
    if (marca === "sin_marca") {
      and.push({ marca: { none: {} } });
    } else if (marca !== "todos") {
      and.push({ marca: { some: { marca: { nombre: marca } } } });
    }

    if (destacado === "true") and.push({ destacado: true });

    if (and.length > 0) where.AND = and;

    // ─── Query + count en paralelo ────────────────────────────────────────────
    const [productos, total] = await prisma.$transaction([
      prisma.producto.findMany({
        where,
        include: {
          categorias: { include: { categoria: { include: { padre: true } } } },
          colores:    { include: { color: true } },
          marca:      { include: { marca: true } },
          paquetes:   { include: { paquete: true } },
          imagenes:   { orderBy: { orden: "asc" } },
        },
        orderBy: { id: "asc" },
        skip,
        take: limit,
      }),
      prisma.producto.count({ where }),
    ]);

    console.log(`📡 GET /api/products — page=${page} limit=${limit} total=${total}`);

    // ─── Formatear ────────────────────────────────────────────────────────────
    const productosFormateados = productos.map((producto) => {
      const tieneCategorias = producto.categorias && producto.categorias.length > 0;
      const categoriasString = tieneCategorias
        ? producto.categorias
            .map((pc) => pc.categoria.padre
              ? `${pc.categoria.padre.nombre} → ${pc.categoria.nombre}`
              : pc.categoria.nombre)
            .join(", ")
        : "Sin categoría";

      const tieneMarca  = producto.marca && producto.marca.length > 0;
      const marcaString = tieneMarca ? producto.marca[0].marca.nombre : "Sin marca";

      const coloresString = producto.colores && producto.colores.length > 0
        ? producto.colores.map((pc) => pc.color.nombre).join(", ")
        : "Sin colores";

      const tieneDescripcion    = producto.descripcion    && producto.descripcion.trim()    !== "";
      const tieneCaracteristica = producto.caracteristica && producto.caracteristica.trim() !== "";
      const tieneImagenes       = producto.imagenes       && producto.imagenes.length > 0;

      let estadoProducto = "Sin completar";
      if (tieneDescripcion && tieneCaracteristica && tieneImagenes) estadoProducto = "Completo";
      else if (tieneDescripcion || tieneCaracteristica || tieneImagenes) estadoProducto = "Incompleto";

      return {
        _cursor_id:          producto.id,
        id:                  producto.id,
        slug:                producto.slug,
        idproducto:          producto.idproducto,
        nombreproducto:      producto.nombreproducto,
        lista1:              producto.lista1?.toNumber(),
        lista2:              producto.lista2?.toNumber(),
        cantidad:            producto.cantidad || 0,
        categorias:          categoriasString,
        colores:             coloresString,
        marca:               marcaString,
        shopify_product_id:  producto.shopify_product_id,
        shopify_variant_id:  producto.shopify_variant_id,
        tieneCategorias,
        tieneMarca,
        estado:              estadoProducto,
        descripcion:         producto.descripcion,
        caracteristica:      producto.caracteristica,
        imagenes:            producto.imagenes,
        activo:              producto.activo,
        activo_manual:       producto.activo_manual,
        destacado:           producto.destacado || false,
      };
    });

    const totalPages = Math.max(1, Math.ceil(total / limit));

    const body = {
      productos:  productosFormateados,
      total,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
    };

    const etag = generarEtag(body);
    const cacheControl = "private, max-age=60, stale-while-revalidate=120";

    if (coincideIfNoneMatch(request.headers.get("if-none-match"), etag)) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          "ETag": etag,
          "Cache-Control": cacheControl,
        },
      });
    }

    return NextResponse.json(body, {
      headers: {
        "ETag": etag,
        "Cache-Control": cacheControl,
      },
    });

  } catch (error) {
    console.error("❌ Error en GET /api/products:", error);
    return NextResponse.json({ error: "Error al obtener productos" }, { status: 500 });
  }
}

// ─── DELETE — sin cambios ─────────────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const { idproducto } = await request.json();

    if (!idproducto) {
      return NextResponse.json({ error: "ID del producto es requerido" }, { status: 400 });
    }

    const existingProduct = await prisma.producto.findUnique({ where: { idproducto } });

    if (!existingProduct) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const nuevoEstado = !existingProduct.activo;

    const productoActualizado = await prisma.producto.update({
      where: { idproducto },
      data:  { activo: nuevoEstado, updated_at: new Date() },
    });

    const mensaje = nuevoEstado
      ? "Producto activado - Ahora se muestra en el ecommerce"
      : "Producto desactivado - Ya no se muestra en el ecommerce";

    return NextResponse.json({
      success: true,
      message: mensaje,
      activo:  productoActualizado.activo,
      producto: {
        id:     productoActualizado.idproducto,
        nombre: productoActualizado.nombreproducto,
        activo: productoActualizado.activo,
      },
    });
  } catch (error) {
    console.error("Error al cambiar estado del producto:", error);
    return NextResponse.json(
      {
        error:   "Error al cambiar estado del producto",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}