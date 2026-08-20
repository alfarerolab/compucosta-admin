/**
 * Normaliza el campo categorias de un producto
 * Retorna un objeto con el string de categorías y un flag booleano
 */
export function normalizeCategoria(categorias: any): { categorias: string; tieneCategorias: boolean } {
  // Si categorias es null, undefined o un string vacío
  if (!categorias || categorias === "" || categorias === "null" || categorias === "undefined") {
    return {
      categorias: "Sin categoría",
      tieneCategorias: false
    };
  }

  // Si es el string literal "Sin categoría"
  if (categorias === "Sin categoría") {
    return {
      categorias: "Sin categoría",
      tieneCategorias: false
    };
  }

  // Si es un string con contenido real
  if (typeof categorias === "string") {
    const trimmed = categorias.trim();
    if (trimmed.length === 0) {
      return {
        categorias: "Sin categoría",
        tieneCategorias: false
      };
    }
    return {
      categorias: trimmed,
      tieneCategorias: true
    };
  }

  // Si es un array de objetos (relaciones de Prisma)
  if (Array.isArray(categorias)) {
    if (categorias.length === 0) {
      return {
        categorias: "Sin categoría",
        tieneCategorias: false
      };
    }

    // Extraer nombres de las categorías
    const nombres = categorias
      .map(cat => {
        // Si el objeto tiene la estructura de la relación Prisma
        if (cat.categoria) {
          if (cat.categoria.padre) {
            return `${cat.categoria.padre.nombre} → ${cat.categoria.nombre}`;
          }
          return cat.categoria.nombre;
        }
        // Si es directamente un objeto con nombre
        if (cat.nombre) {
          return cat.nombre;
        }
        return null;
      })
      .filter(Boolean);

    if (nombres.length === 0) {
      return {
        categorias: "Sin categoría",
        tieneCategorias: false
      };
    }

    return {
      categorias: nombres.join(", "),
      tieneCategorias: true
    };
  }

  // Si es un objeto (caso raro pero posible)
  if (typeof categorias === "object") {
    if (categorias.nombre) {
      return {
        categorias: categorias.nombre,
        tieneCategorias: true
      };
    }
  }

  // Fallback
  return {
    categorias: "Sin categoría",
    tieneCategorias: false
  };
}

/**
 * Normaliza el campo marca de un producto
 */
export function normalizeMarca(marca: any): { marca: string; tieneMarca: boolean } {
  // Si marca es null, undefined o un string vacío
  if (!marca || marca === "" || marca === "null" || marca === "undefined") {
    return {
      marca: "Sin marca",
      tieneMarca: false
    };
  }

  // Si es el string literal "Sin marca"
  if (marca === "Sin marca") {
    return {
      marca: "Sin marca",
      tieneMarca: false
    };
  }

  // Si es un string con contenido real
  if (typeof marca === "string") {
    const trimmed = marca.trim();
    if (trimmed.length === 0) {
      return {
        marca: "Sin marca",
        tieneMarca: false
      };
    }
    return {
      marca: trimmed,
      tieneMarca: true
    };
  }

  // Si es un array de objetos (relaciones de Prisma)
  if (Array.isArray(marca)) {
    if (marca.length === 0) {
      return {
        marca: "Sin marca",
        tieneMarca: false
      };
    }

    const primeraMarca = marca[0];
    if (primeraMarca.marca && primeraMarca.marca.nombre) {
      return {
        marca: primeraMarca.marca.nombre,
        tieneMarca: true
      };
    }
    if (primeraMarca.nombre) {
      return {
        marca: primeraMarca.nombre,
        tieneMarca: true
      };
    }
  }

  // Si es un objeto
  if (typeof marca === "object") {
    if (marca.nombre) {
      return {
        marca: marca.nombre,
        tieneMarca: true
      };
    }
  }

  // Fallback
  return {
    marca: "Sin marca",
    tieneMarca: false
  };
}
