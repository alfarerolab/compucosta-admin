"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import ProductForm from "@/components/forms/product-form";
import { toast } from "sonner";

interface ImagenProducto {
  url: string;
  altText?: string;
  esPrincipal: boolean;
  orden: number;
}

interface Marca {
  id: number;
  nombre: string;
}

interface Categoria {
  id: number;
  nombre: string;
}

interface Color {
  id: number;
  nombre: string;
  codigoHex: string;
}

interface ProductAPI {
  id: number;
  idproducto: string;
  nombreproducto: string;
  lista1?: number;
  lista2?: number;
  lista2_activa?: boolean;
  porciva?: number;
  ivaincluido?: string;
  descripcion?: string;
  caracteristica?: string;
  slug?: string;
  destacado: boolean;
  cantidad: number;
  created_at: string;
  updated_at: string;
  categorias: any;
  colores: any;
  marca: any;
  paquetes?: any;
  imagenes?: any[];
  nombre_familia?: string;
  nombre_subfamilia?: string;
  nombre_marca?: string;
  existencia?: number;
}

interface ProductFormData {
  idproducto: string;
  nombreproducto: string;
  lista1: string;
  lista2: string;
  lista2_activa: boolean;
  porciva?: string;
  ivaincluido: "S" | "N";
  descripcion?: string;
  caracteristica?: string;
  slug: string;
  destacado: boolean;
  cantidad: number;
  categoriaIds: number[];
  colorIds: number[];
  marcaId: number | null; 
  imagenes?: ImagenProducto[];
  nombre_familia?: string;
  nombre_subfamilia?: string;
  nombre_marca?: string;
  paqueteId?: number | null;
  existencia?: number;
}

const generateSlug = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export default function EditProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const [product, setProduct] = useState<ProductFormData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const resolvedParams = use(params);
  const productId = resolvedParams.productId;

  useEffect(() => {
    const fetchProduct = async () => {
      if (!productId) {
        console.error("❌ No hay productId disponible");
        setError("ID de producto no disponible");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        console.log("🔄 Intentando cargar producto:", productId);
        
        // ✅ FORZAR RECARGA SIN CACHÉ
        const response = await fetch(`/api/products/${productId}?t=${Date.now()}`, {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
        
        console.log("📡 Respuesta del API:", {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok
        });
        
        if (response.status === 404) {
          const errorData = await response.json();
          console.error("❌ Producto no encontrado (404):", errorData);
          setError(`Producto con ID "${productId}" no encontrado en la base de datos`);
          toast.error("Producto no encontrado");
          setLoading(false);
          return;
        }
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Error desconocido" }));
          console.error("❌ Error HTTP:", response.status, errorData);
          throw new Error(errorData.error || `Error HTTP ${response.status}`);
        }
        
        const data: ProductAPI = await response.json();

        console.log("📦 Datos recibidos de la API:", data);
        console.log("📦 Categorías raw:", data.categorias);
        console.log("📦 Colores raw:", data.colores);
        console.log("📦 Marca raw:", data.marca);
        console.log("📦 Paquetes raw:", data.paquetes);

        // ✅ MEJORAR EXTRACCIÓN DE CATEGORÍAS
        let categoriaIds: number[] = [];
        if (typeof data.categorias === 'string') {
          categoriaIds = data.categorias.split(',')
            .map(c => parseInt(c.trim()))
            .filter(id => !isNaN(id));
        } else if (Array.isArray(data.categorias)) {
          categoriaIds = data.categorias.map(cat => {
            if (typeof cat === 'number') return cat;
            if (typeof cat === 'object' && cat !== null) {
              if ('id' in cat) return cat.id;
              if ('categoria_id' in cat) return cat.categoria_id;
              if ('categoria' in cat && typeof cat.categoria === 'object' && cat.categoria !== null && 'id' in cat.categoria) {
                return cat.categoria.id;
              }
            }
            return 0;
          }).filter(id => id !== 0);
        }
        console.log("✅ Categorías procesadas:", categoriaIds);

        // ✅ MEJORAR EXTRACCIÓN DE COLORES
        let colorIds: number[] = [];
        if (typeof data.colores === 'string') {
          colorIds = data.colores.split(',')
            .map(c => parseInt(c.trim()))
            .filter(id => !isNaN(id));
        } else if (Array.isArray(data.colores)) {
          colorIds = data.colores.map(col => {
            if (typeof col === 'number') return col;
            if (typeof col === 'object' && col !== null) {
              if ('id' in col) return col.id;
              if ('color_id' in col) return col.color_id;
              if ('color' in col && typeof col.color === 'object' && col.color !== null && 'id' in col.color) {
                return col.color.id;
              }
            }
            return 0;
          }).filter(id => id !== 0);
        }
        console.log("✅ Colores procesados:", colorIds);

        // ✅ MEJORAR EXTRACCIÓN DE MARCA
        let marcaId: number | null = null;
        if (typeof data.marca === 'number') {
          marcaId = data.marca;
        } else if (Array.isArray(data.marca) && data.marca.length > 0) {
          const primeraMarca = data.marca[0];
          if (typeof primeraMarca === 'number') {
            marcaId = primeraMarca;
          } else if (primeraMarca.marca && typeof primeraMarca.marca === "object" && "id" in primeraMarca.marca) {
            marcaId = Number(primeraMarca.marca.id);
          } else if ("id_marca" in primeraMarca) {
            marcaId = Number(primeraMarca.id_marca);
          } else if ("marca_id" in primeraMarca) {
            marcaId = Number(primeraMarca.marca_id);
          } else if ("id" in primeraMarca) {
            marcaId = Number(primeraMarca.id);
          }
        } else if (typeof data.marca === 'object' && data.marca !== null && 'id' in data.marca) {
          marcaId = Number(data.marca.id);
        }
        console.log("✅ Marca procesada:", marcaId);

        // ✅ MEJORAR EXTRACCIÓN DE PAQUETE
        let paqueteId: number | null = null;
        if (data.paquetes) {
          if (typeof data.paquetes === 'number') {
            paqueteId = data.paquetes;
          } else if (Array.isArray(data.paquetes) && data.paquetes.length > 0) {
            const primerPaquete = data.paquetes[0];
            
            if (typeof primerPaquete === 'number') {
              paqueteId = primerPaquete;
            } else if (primerPaquete.paquete && typeof primerPaquete.paquete === "object" && "id" in primerPaquete.paquete) {
              paqueteId = Number(primerPaquete.paquete.id);
            } else if ("id_paquete" in primerPaquete) {
              paqueteId = Number(primerPaquete.id_paquete);
            } else if ("paquete_id" in primerPaquete) {
              paqueteId = Number(primerPaquete.paquete_id);
            } else if ("id" in primerPaquete && typeof primerPaquete.id === "number") {
              paqueteId = Number(primerPaquete.id);
            }
          } else if (typeof data.paquetes === "object" && "id" in data.paquetes) {
            paqueteId = Number(data.paquetes.id);
          }
        }
        console.log("✅ Paquete procesado:", paqueteId);

        // Formatear imágenes
        let imagenes: ImagenProducto[] = [];
        if (Array.isArray(data.imagenes)) {
          imagenes = data.imagenes.map(img => ({
            url: img.url,
            altText: img.alt_text || img.altText || "",
            esPrincipal: img.es_principal || img.esPrincipal || false,
            orden: img.orden || 0
          }));
        }

        const slug = data.slug || generateSlug(data.nombreproducto);

        // Transformar los datos al formato que espera el ProductForm
        const productData: ProductFormData = {
          idproducto: data.idproducto,
          nombreproducto: data.nombreproducto,
          lista1: data.lista1?.toString() || "",
          lista2: data.lista2?.toString() || "",
          lista2_activa: Boolean(data.lista2_activa),
          porciva: data.porciva?.toString(),
          ivaincluido: (data.ivaincluido === "1" || data.ivaincluido === "S") ? "S" : "N",
          descripcion: data.descripcion || "",
          caracteristica: data.caracteristica || "",
          slug: slug,
          destacado: Boolean(data.destacado),
          cantidad: data.cantidad || 0,
          categoriaIds: categoriaIds,
          colorIds: colorIds,
          marcaId: marcaId,
          paqueteId: paqueteId,
          imagenes: imagenes,
          nombre_familia: data.nombre_familia || "Sin familia",
          nombre_subfamilia: data.nombre_subfamilia || "Sin subfamilia",
          nombre_marca: data.nombre_marca || "Sin marca",
          existencia: data.existencia || 0,
        };

        console.log("✅ Datos finales para el formulario:", productData);
        
        setProduct(productData);
        setError(null);
      } catch (error) {
        console.error("❌ Error al cargar el producto:", error);
        const errorMessage = error instanceof Error ? error.message : "Error desconocido";
        setError(`Error al cargar el producto: ${errorMessage}`);
        toast.error("Error al cargar el producto");
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [productId, refreshKey]); // ✅ Dependencia de refreshKey para forzar recarga

  // ✅ Función para refrescar datos después de guardar
  const handleProductSaved = () => {
    console.log("🔄 Refrescando datos del producto...");
    setRefreshKey(prev => prev + 1);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <div className="text-xl">Cargando producto {productId}...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="text-xl text-red-500 font-bold">⚠️ Error</div>
        <div className="text-lg text-gray-700 max-w-md text-center">{error}</div>
        <div className="text-sm text-gray-500">ID solicitado: {productId}</div>
        <button
          onClick={() => window.history.back()}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Volver atrás
        </button>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="text-xl text-red-500 font-bold">Producto no encontrado</div>
        <div className="text-sm text-gray-500">ID solicitado: {productId}</div>
        <button
          onClick={() => window.history.back()}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Volver atrás
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full h-full">
      <ProductForm 
        initialData={product} 
        onSaveSuccess={handleProductSaved}
      />
    </div>
  );
}