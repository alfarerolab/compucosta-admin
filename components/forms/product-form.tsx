"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { X, Plus, ChevronRight } from "lucide-react";

// Interfaces actualizadas para categorías jerárquicas
interface Marca {
  id: number;
  idmarca: number; 
  nombre: string;
}

interface Categoria {
  id: number;
  nombre: string;
  padre_id?: number | null;
  hijos?: Categoria[];
}

interface Color {
  id: number;
  nombre: string;
  codigoHex: string;
}

interface ImageData {
  url: string;
  file?: File;
  previewUrl: string;
}

interface Paquete {
  id: number;
  nombre: string;
  altoCm: number;
  anchoCm: number;
  largoCm: number;
  pesoKg: number;
}

// Función para construir URL con parámetros de paginación preservados
const buildReturnUrl = (searchParams: URLSearchParams) => {
  const params = new URLSearchParams();
  
  // Preservar parámetros de paginación y filtros
  if (searchParams.get('page')) params.set('page', searchParams.get('page')!);
  if (searchParams.get('itemsPerPage')) params.set('itemsPerPage', searchParams.get('itemsPerPage')!);
  if (searchParams.get('busqueda')) params.set('busqueda', searchParams.get('busqueda')!);
  if (searchParams.get('estado')) params.set('estado', searchParams.get('estado')!);
  if (searchParams.get('categoria')) params.set('categoria', searchParams.get('categoria')!);
  if (searchParams.get('marca')) params.set('marca', searchParams.get('marca')!);
  if (searchParams.get('precioMin')) params.set('precioMin', searchParams.get('precioMin')!);
  if (searchParams.get('precioMax')) params.set('precioMax', searchParams.get('precioMax')!);
  if (searchParams.get('cantidadMin')) params.set('cantidadMin', searchParams.get('cantidadMin')!);
  if (searchParams.get('cantidadMax')) params.set('cantidadMax', searchParams.get('cantidadMax')!);
  
  const queryString = params.toString();
  return `/dashboard/products${queryString ? `?${queryString}` : ''}`;
};

// Schema con validación condicional
const formSchema = z.object({
  idproducto: z.string().min(1, "ID del producto es obligatorio"),
  nombreproducto: z.string().min(1, "Nombre del producto es obligatorio"),
  lista1: z.string().min(1, "El precio es obligatorio"),
  lista2: z.string().optional(),
  lista2_activa: z.boolean().default(false),
  porciva: z.string().optional(),
  ivaincluido: z.enum(["S", "N"]).default("N"),
  descripcion: z.string().optional(),
  caracteristica: z.string().optional(),
  slug: z.string().min(1, "Slug es obligatorio"),
  destacado: z.boolean().default(false),
  cantidad: z.number().min(0, "Cantidad debe ser un número positivo").default(0),
  categoriaIds: z.array(z.number()),
  colorIds: z.array(z.number()),
  marcaId: z.union([z.number(), z.null()]).optional(),
  paqueteId: z.union([z.number(), z.null()]).optional(),
  imagenes: z.array(z.object({ 
    url: z.string(),
    orden: z.number(),
    esPrincipal: z.boolean(),
    altText: z.string().optional()
  })).optional(),
}).refine((data) => {
  // Si lista2_activa es true, entonces lista2 debe tener valor
  if (data.lista2_activa && (!data.lista2 || data.lista2.trim() === "")) {
    return false;
  }
  return true;
}, {
  message: "Lista 2 es obligatoria cuando está activada",
  path: ["lista2"],
});

type ProductFormValues = z.infer<typeof formSchema>;

interface ProductFormProps {
  initialData?: ProductFormValues;
  onSaveSuccess?: () => void;
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

// HELPER: Función para normalizar valores boolean
const normalizeBoolean = (value: any): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  if (typeof value === 'number') return value === 1;
  return false;
};

export default function ProductForm({ initialData, onSaveSuccess }: ProductFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [images, setImages] = useState<ImageData[]>([]);
  const [imageUrl, setImageUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [colores, setColores] = useState<Color[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [imagenPrincipal, setImagenPrincipal] = useState<string | null>(null);
  const [uploadMethod, setUploadMethod] = useState<"url" | "file">("url");
  const [paquetes, setPaquetes] = useState<Paquete[]>([]);
  const [characteristics, setCharacteristics] = useState<{key: string, value: string}[]>([]);

  const isEditing = !!initialData?.idproducto;

  // Form con valores por defecto normalizados
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onChange',
    defaultValues: initialData
      ? {
          ...initialData,
          marcaId: initialData.marcaId ? Number(initialData.marcaId) : null,
          paqueteId: initialData.paqueteId ? Number(initialData.paqueteId) : null,
          lista2_activa: normalizeBoolean(initialData.lista2_activa),
        }
      : {
          idproducto: "",
          nombreproducto: "",
          lista1: "",
          lista2: "",
          lista2_activa: false,
          porciva: "",
          ivaincluido: "N",
          descripcion: "",
          caracteristica: "",
          slug: "",
          destacado: false,
          cantidad: 0,
          categoriaIds: [],
          colorIds: [],
          marcaId: null,
          paqueteId: null,
        },
  });

  const watchedCategoriaIds = form.watch('categoriaIds');
  const watchedColorIds = form.watch('colorIds');
  const watchedMarcaId = form.watch('marcaId');
  const watchedLista2Activa = form.watch('lista2_activa');
  const watchedPaqueteId = form.watch('paqueteId');

  // Función para organizar categorías jerárquicamente
  const organizarCategorias = (cats: Categoria[]) => {
    const categoriasPadre = cats.filter(cat => cat.padre_id === null);
    const categoriasHijo = cats.filter(cat => cat.padre_id !== null);

    return categoriasPadre.map(padre => ({
      ...padre,
      hijos: categoriasHijo.filter(hijo => hijo.padre_id === padre.id)
    }));
  };

  // Función para obtener el nombre completo de la categoría (incluyendo padre)
  const getNombreCompletoCategoria = (categoria: Categoria, todasCategorias: Categoria[]) => {
    if (categoria.padre_id) {
      const padre = todasCategorias.find(cat => cat.id === categoria.padre_id);
      return padre ? `${padre.nombre} → ${categoria.nombre}` : categoria.nombre;
    }
    return categoria.nombre;
  };

  // Función para obtener solo las subcategorías (nivel 3)
  const getSubcategorias = () => {
    return categorias.filter(cat => cat.padre_id !== null);
  };

  useEffect(() => {
    const subscription = form.watch((values) => {
      if (values.nombreproducto && !initialData) {
        const generatedSlug = generateSlug(values.nombreproducto);
        form.setValue('slug', generatedSlug, { 
          shouldValidate: true,
          shouldDirty: true
        });
      }
    });

    return () => subscription.unsubscribe();
  }, [form, initialData]);

  // useEffect simplificado para initialData
  useEffect(() => {
    if (initialData?.imagenes) {
      setImages(initialData.imagenes.map(img => ({
        url: img.url,
        previewUrl: img.url
      })));
      
      const principalImage = initialData.imagenes.find(img => img.esPrincipal);
      if (principalImage) {
        setImagenPrincipal(principalImage.url);
      }
    }
    
    // SIMPLIFICADO: Solo normalizar si es necesario
    if (initialData && initialData.lista2_activa !== undefined) {
      form.setValue('lista2_activa', normalizeBoolean(initialData.lista2_activa));
    }
  }, [initialData, form]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [categoriasRes, coloresRes, marcasRes, paquetesRes] = await Promise.all([
          fetch("/api/categories"),
          fetch("/api/colors"),
          fetch("/api/marcas"),
          fetch("/api/paquetes"),
        ]);
  
        const categoriasData = await categoriasRes.json();
        const coloresData = await coloresRes.json();
        const marcasData = await marcasRes.json();
        const paquetesData = await paquetesRes.json();
setPaquetes(paquetesData);
  
        let marcasArray = marcasData;
        if (marcasData && typeof marcasData === 'object' && !Array.isArray(marcasData)) {
          if (marcasData.marcas) {
            marcasArray = marcasData.marcas;
          } else {
            marcasArray = Object.values(marcasData);
          }
        }
  
        setCategorias(categoriasData);
        setColores(coloresData);
        setMarcas(marcasArray);
      } catch (error) {
        console.error("Error en fetchData:", error);
        toast.error("Error al cargar los datos del formulario");
      }
    };
  
    fetchData();
  }, []);

  useEffect(() => {
    const currentValue = form.getValues('caracteristica');
    if (currentValue) {
      const parsedCharacteristics = currentValue
        .split('\n')
        .filter(line => line.trim() !== '')
        .map(line => {
          const [key, value] = line.split(':').map(s => s.trim());
          return { key: key || '', value: value || '' };
        });
      setCharacteristics(parsedCharacteristics);
    }
  }, [form]);

  const updateFormCharacteristics = (newCharacteristics: {key: string, value: string}[]) => {
    const formattedValue = newCharacteristics
      .filter(char => char.key.trim() !== '' || char.value.trim() !== '')
      .map(char => `${char.key}: ${char.value}`)
      .join('\n');
    form.setValue('caracteristica', formattedValue);
    setCharacteristics(newCharacteristics);
  };

  const addCharacteristic = () => {
    const newCharacteristics = [...characteristics, { key: '', value: '' }];
    updateFormCharacteristics(newCharacteristics);
  };

  const removeCharacteristic = (index: number) => {
    const newCharacteristics = characteristics.filter((_, i) => i !== index);
    updateFormCharacteristics(newCharacteristics);
  };

  const updateCharacteristic = (index: number, field: 'key' | 'value', newValue: string) => {
    const newCharacteristics = [...characteristics];
    newCharacteristics[index][field] = newValue;
    updateFormCharacteristics(newCharacteristics);
  };
    
  const handleFileUpload = async (files: FileList | null) => {
    if (!files) return;

    setIsUploading(true);
    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("uploadType", "products");
        
        if (initialData?.idproducto) {
          formData.append("itemId", initialData.idproducto);
        }

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error("Upload failed");
        }

        const data = await response.json();
        
        if (data.path) {
          return {
            url: data.path,
            previewUrl: data.path
          };
        } else {
          throw new Error("No se recibió la ruta de la imagen");
        }
      });

      const uploadedImages = await Promise.all(uploadPromises);
      setImages((prev) => [...prev, ...uploadedImages]);
      
      toast.success("Imágenes subidas correctamente");
    } catch (error) {
      toast.error("Error al subir las imágenes");
      console.error("Image upload error:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleUrlAdd = () => {
    if (imageUrl.trim()) {
      setImages(prev => [...prev, {
        url: imageUrl.trim(),
        previewUrl: imageUrl.trim()
      }]);
      setImageUrl("");
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(prev => {
      const newImages = [...prev];
      if (newImages[index].previewUrl) {
        URL.revokeObjectURL(newImages[index].previewUrl);
      }
      newImages.splice(index, 1);
      return newImages;
    });
  };

  const handleSetPrincipal = (url: string) => {
    setImagenPrincipal(url);
  };

  const handleCategorySelect = (value: string) => {
    const currentIds = form.getValues('categoriaIds');
    const newValue = parseInt(value);
    if (!currentIds.includes(newValue)) {
      const newIds = [...currentIds, newValue];
      form.setValue('categoriaIds', newIds, { 
        shouldValidate: true, 
        shouldDirty: true,
        shouldTouch: true 
      });
      form.trigger('categoriaIds');
    }
  };

  const handleColorSelect = (value: string) => {
    const currentIds = form.getValues('colorIds');
    const newValue = parseInt(value);
    if (!currentIds.includes(newValue)) {
      const newIds = [...currentIds, newValue];
      form.setValue('colorIds', newIds, { 
        shouldValidate: true, 
        shouldDirty: true,
        shouldTouch: true 
      });
      form.trigger('colorIds');
    }
  };

  const removeCategoryId = (categoriaId: number) => {
    const currentIds = form.getValues('categoriaIds');
    const newIds = currentIds.filter(id => id !== categoriaId);
    form.setValue('categoriaIds', newIds, { 
      shouldValidate: true, 
      shouldDirty: true,
      shouldTouch: true 
    });
    form.trigger('categoriaIds');
  };

  const removeColorId = (colorId: number) => {
    const currentIds = form.getValues('colorIds');
    const newIds = currentIds.filter(id => id !== colorId);
    form.setValue('colorIds', newIds, { 
      shouldValidate: true, 
      shouldDirty: true,
      shouldTouch: true 
    });
    form.trigger('colorIds');
  };

  const onSubmit = async (data: ProductFormValues) => {
    console.log("Button pressed - Executing onSubmit");
    console.log("Form data lista2_activa:", data.lista2_activa);
    
    if (!data || !data.idproducto) {
      console.error("No form data or missing product ID");
      toast.error("Missing product data.");
      return;
    }
    
    try {
      setIsUploading(true);
      
      const formattedImages = images.map((img, index) => ({
        url: img.url,
        orden: index,
        esPrincipal: img.previewUrl === imagenPrincipal,
        altText: data.nombreproducto || "",
      }));
      
      console.log("Images to send:", formattedImages);
      
      const isEditing = !!initialData?.idproducto;

      const commonData = {
        descripcion: data.descripcion || "",
        caracteristica: data.caracteristica || "",
        slug: data.slug,
        destacado: Boolean(data.destacado),
        colorIds: Array.isArray(data.colorIds) ? data.colorIds.map(id => Number(id)) : [],
        imagenes: formattedImages,
        paqueteId: data.paqueteId ? Number(data.paqueteId) : null,
      };

      const erpFields = {
        idproducto: data.idproducto,
        nombreproducto: data.nombreproducto,
        lista1: parseFloat(data.lista1) || 0,
        lista2: data.lista2_activa ? (parseFloat(data.lista2 ?? "0") || 0) : 0,
        lista2_activa: Boolean(data.lista2_activa),
        porciva: data.porciva ? parseFloat(data.porciva) : null,
        ivaincluido: data.ivaincluido || "N",
        cantidad: Number(data.cantidad) || 0,
        categoriaIds: Array.isArray(data.categoriaIds) ? data.categoriaIds.map(id => Number(id)) : [],
        marcaId: data.marcaId ? Number(data.marcaId) : null,
      };

      const finalData = isEditing ? commonData : { ...commonData, ...erpFields };
      
      const endpoint = isEditing ? `/api/products/${data.idproducto}` : "/api/products";
      
      console.log("Endpoint:", endpoint);
      console.log("Final data to send:", JSON.stringify(finalData, null, 2));
      
      const response = await fetch(endpoint, {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(finalData),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        let parsedError;
        try {
          parsedError = JSON.parse(errorText);
        } catch {
          parsedError = { error: errorText || "Unknown error" };
        }
        
        console.error("Server response error:", parsedError);
        toast.error(parsedError.error || `Error ${response.status}: ${response.statusText}`);
        return;
      }
      
      toast.success(isEditing ? "Producto actualizado correctamente" : "Producto creado correctamente");

// ✅ NUEVO: Llamar al callback si existe (para refrescar datos en página de edición)
        if (onSaveSuccess && isEditing) {
          onSaveSuccess();
        }

        // NUEVO: Limpiar caché para forzar recarga de datos
        if (typeof window !== 'undefined') {
          localStorage.removeItem('productos_cache');
          localStorage.removeItem('productos_cache_timestamp');
        }

        // CAMBIO PRINCIPAL: Construir URL con parámetros preservados
        const returnUrl = buildReturnUrl(searchParams);
        console.log("Redirecting to:", returnUrl);

        // Forzar recarga completa
        router.push(returnUrl);
        router.refresh();

        // ADICIONAL: Disparar evento personalizado para notificar cambios
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('productUpdated', {
            detail: { productId: data.idproducto, action: isEditing ? 'updated' : 'created' }
          }));
        }
      
    } catch (error) {
      console.error("Error in onSubmit:", error);
      toast.error(error instanceof Error ? error.message : "Error saving product");
    } finally {
      setIsUploading(false);
    }
  };

  // Función para el botón de retroceso que también preserve los parámetros
  const handleBack = () => {
    const returnUrl = buildReturnUrl(searchParams);
    router.push(returnUrl);
  };

  return (
    <div className="space-y-4">
      <br />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 pl-8">
          <br />
          <Button variant="ghost" onClick={handleBack}>
            <X className="h-4 w-4" />
          </Button>
          <h2 className="text-3xl font-bold tracking-tight">
            {initialData ? "Editar Producto" : "Crear Producto"}
          </h2>
        </div>
      </div>

      <Card className="mb-6 max-w-screen-2xl mx-auto w-full">
        <CardHeader>
          <CardTitle>Información del Producto</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              
               <FormField
                name="idproducto"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID del Producto</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ingrese ID del producto"
                        readOnly={isEditing}
                        className={isEditing ? 'bg-muted cursor-not-allowed' : ''}
                        {...field}
                      />
                    </FormControl>
                    {isEditing && (
                      <p className="text-xs text-muted-foreground">Gestionado por ERP</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              
               <FormField
                name="nombreproducto"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del Producto</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Nombre del producto"
                        readOnly={isEditing}
                        className={isEditing ? 'bg-muted cursor-not-allowed' : ''}
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          if (!isEditing) {
                            const generatedSlug = generateSlug(e.target.value);
                            form.setValue('slug', generatedSlug, { 
                              shouldValidate: true,
                              shouldDirty: true
                            });
                          }
                        }}
                      />
                    </FormControl>
                    {isEditing && (
                      <p className="text-xs text-muted-foreground">Gestionado por ERP</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Checkbox siguiendo el patrón de destacado */}
              <FormField
                name="lista2_activa"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Activar Lista de Precios 2
                      </FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Cuando esté activada, se utilizará como precio original para mostrar ofertas
                      </p>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Precios */}
              <div className={`grid grid-cols-1 ${watchedLista2Activa ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
                <FormField
                  control={form.control}
                  name="lista1"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Precio Lista 1 *
                        {watchedLista2Activa && (
                          <span className="text-sm text-muted-foreground ml-2">(Precio con descuento)</span>
                        )}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          readOnly={isEditing}
                          className={isEditing ? 'bg-muted cursor-not-allowed' : ''}
                          {...field}
                        />
                      </FormControl>
                      {isEditing && (
                        <p className="text-xs text-muted-foreground">Gestionado por ERP</p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {watchedLista2Activa && (
                  <FormField
                    control={form.control}
                    name="lista2"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Precio Lista 2 *
                          <span className="text-sm text-muted-foreground ml-2">(Precio original)</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            readOnly={isEditing}
                            className={isEditing ? 'bg-muted cursor-not-allowed' : ''}
                            {...field}
                          />
                        </FormControl>
                        {isEditing && (
                          <p className="text-xs text-muted-foreground">Gestionado por ERP</p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  name="porciva"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Porcentaje IVA</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          readOnly={isEditing}
                          className={isEditing ? 'bg-muted cursor-not-allowed' : ''}
                          {...field}
                        />
                      </FormControl>
                      {isEditing && (
                        <p className="text-xs text-muted-foreground">Gestionado por ERP</p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                name="ivaincluido"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>IVA Incluido</FormLabel>
                    <FormControl>
                      <select
                        className={`w-full p-2 border rounded ${isEditing ? 'bg-muted cursor-not-allowed' : ''}`}
                        disabled={isEditing}
                        {...field}
                      >
                        <option value="N">No</option>
                        <option value="S">Sí</option>
                      </select>
                    </FormControl>
                    {isEditing && (
                      <p className="text-xs text-muted-foreground">Gestionado por ERP</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="descripcion"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Descripción detallada del producto" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="caracteristica"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Características Técnicas</FormLabel>
                    <div className="space-y-2">
                      {characteristics.map((char, index) => (
                        <div key={index} className="flex space-x-2 items-center">
                          <Input
                            placeholder="Característica"
                            value={char.key}
                            onChange={(e) => updateCharacteristic(index, 'key', e.target.value)}
                            className="flex-1"
                          />
                          <Input
                            placeholder="Valor"
                            value={char.value}
                            onChange={(e) => updateCharacteristic(index, 'value', e.target.value)}
                            className="flex-1"
                          />
                          <Button 
                            type="button" 
                            variant="destructive" 
                            size="icon" 
                            onClick={() => removeCharacteristic(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={addCharacteristic}
                        className="w-full"
                      >
                        <Plus className="mr-2 h-4 w-4" /> Agregar Característica
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  name="slug"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Slug</FormLabel>
                      <FormControl>
                        <Input placeholder="url-amigable-del-producto" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  name="cantidad"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cantidad</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          readOnly={isEditing}
                          className={isEditing ? 'bg-muted cursor-not-allowed' : ''}
                          {...field}
                          onChange={isEditing ? undefined : e => field.onChange(parseInt(e.target.value))}
                        />
                      </FormControl>
                      {isEditing && (
                        <p className="text-xs text-muted-foreground">Gestionado por ERP</p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                name="destacado"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel>Producto Destacado</FormLabel>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="categoriaIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categorías (Subcategorías)</FormLabel>
                    <p className="text-sm text-gray-500 mb-2">
                      Selecciona las subcategorías específicas para este producto
                    </p>
                    <Select onValueChange={handleCategorySelect}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar subcategorías" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-60">
                        {organizarCategorias(categorias).map((categoriaPadre) => (
                          <div key={`padre-${categoriaPadre.id}`}>
                            <div className="px-2 py-1 text-sm font-semibold text-gray-600 bg-gray-50 border-b">
                              {categoriaPadre.nombre}
                            </div>
                            {categoriaPadre.hijos?.map((subcategoria) => (
                              <SelectItem 
                                key={subcategoria.id} 
                                value={subcategoria.id.toString()}
                                className="pl-6"
                              >
                                <div className="flex items-center gap-2">
                                  <ChevronRight className="w-3 h-3 text-gray-400" />
                                  {subcategoria.nombre}
                                </div>
                              </SelectItem>
                            )) || []}
                          </div>
                        ))}
                        
                        {getSubcategorias().filter(sub => 
                          !organizarCategorias(categorias).some(padre => 
                            padre.hijos?.some(hijo => hijo.id === sub.id)
                          )
                        ).map((subcategoria) => (
                          <SelectItem key={subcategoria.id} value={subcategoria.id.toString()}>
                            {subcategoria.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    <div className="flex flex-wrap gap-2 mt-2">
                      {watchedCategoriaIds.map((categoriaId) => {
                        const categoria = categorias.find(c => c.id === categoriaId);
                        if (!categoria) return null;
                        
                        return (
                          <Badge key={categoriaId} variant="secondary" className="flex items-center gap-1">
                            <span className="text-xs">
                              {getNombreCompletoCategoria(categoria, categorias)}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeCategoryId(categoriaId)}
                              className="ml-1 hover:bg-gray-200 rounded-full p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="marcaId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Marca</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(Number(value))}
                      value={field.value ? field.value.toString() : ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue>
                            {marcas.find(m => m.id === field.value)?.nombre || "Seleccionar marca"}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {marcas.map((marca) => (
                          <SelectItem key={marca.id} value={marca.id.toString()}>
                            {marca.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
              control={form.control}
              name="paqueteId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Paquete</FormLabel>
                  <Select
                    onValueChange={(value) => field.onChange(Number(value))}
                    value={field.value ? field.value.toString() : ""}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue>
                          {paquetes.find(p => p.id === field.value)?.nombre || "Seleccionar paquete"}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {paquetes.map((paquete) => (
                        <SelectItem key={paquete.id} value={paquete.id.toString()}>
                          {paquete.nombre} ({paquete.altoCm}×{paquete.anchoCm}×{paquete.largoCm} cm, {paquete.pesoKg} Kg)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

              <FormField
                control={form.control}
                name="colorIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Colores</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        const currentIds = field.value;
                        const newValue = parseInt(value);
                        if (!currentIds.includes(newValue)) {
                          field.onChange([...currentIds, newValue]);
                        }
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar colores" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {colores.map((color) => (
                          <SelectItem key={color.id} value={color.id.toString()}>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-4 h-4 rounded-full"
                                style={{ backgroundColor: color.codigoHex }}
                              />
                              {color.nombre}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {field.value.map((colorId) => {
                        const color = colores.find(c => c.id === colorId);
                        return (
                          <Badge
                            key={colorId}
                            variant="secondary"
                            style={{
                              backgroundColor: color?.codigoHex,
                              color: '#000000',
                            }}
                          >
                            {color?.nombre}
                            <button
                              type="button"
                              onClick={() => {
                                field.onChange(field.value.filter(id => id !== colorId));
                              }}
                              className="ml-1"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Imágenes */}
              <div>
                <FormLabel className="block mb-2">Imágenes</FormLabel>
                
                <Tabs value={uploadMethod} onValueChange={(v) => setUploadMethod(v as "url" | "file")}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="url">URL</TabsTrigger>
                    <TabsTrigger value="file">Subir Archivo</TabsTrigger>
                  </TabsList>
                  <TabsContent value="url">
                    <div className="flex gap-2 mb-4">
                      <Input
                        placeholder="URL de la imagen"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                      />
                      <Button type="button" onClick={handleUrlAdd}>
                        Agregar URL
                      </Button>
                    </div>
                  </TabsContent>
                  <TabsContent value="file">
                    <div className="flex items-center justify-center w-full">
                      <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <Upload className="w-8 h-8 mb-4 text-gray-500" />
                          <p className="mb-2 text-sm text-gray-500">
                            <span className="font-semibold">Click para subir</span> o arrastra y suelta
                          </p>
                          <p className="text-xs text-gray-500">PNG, JPG o JPEG (MAX. 10MB)</p>
                        </div>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          multiple
                          onChange={(e) => handleFileUpload(e.target.files)}
                        />
                      </label>
                    </div>
                  </TabsContent>
                </Tabs>

                {/* Image Preview */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                  {images.map((image, index) => (
                    <div 
                      key={index} 
                      className={`relative group border-2 rounded ${
                        imagenPrincipal === image.previewUrl 
                          ? "border-blue-500" 
                          : "border-transparent"
                      }`}
                    >
                      <img
                        src={image.previewUrl}
                        alt={`Imagen ${index + 1}`}
                        className="w-full h-32 object-cover rounded"
                      />
                      <div className="absolute top-0 left-0 bg-black bg-opacity-50 text-white px-2 py-1 text-xs">
                        {imagenPrincipal === image.previewUrl ? "Principal" : `Imagen ${index + 1}`}
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black bg-opacity-40 transition-opacity">
                        <Button
                          type="button"
                          variant={imagenPrincipal === image.previewUrl ? "default" : "outline"}
                          size="sm"
                          className="m-1"
                          onClick={() => handleSetPrincipal(image.previewUrl)}
                        >
                          {imagenPrincipal === image.previewUrl ? "Principal ✓" : "Es principal"}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="m-1"
                          onClick={() => handleRemoveImage(index)}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            <Button type="submit" disabled={isUploading} className="mt-6">
              {isUploading ? "Guardando..." : "Guardar Producto"}
            </Button>
            </form>
      </Form>
      <br />
      </CardContent>
      </Card>
    </div>
  );
}