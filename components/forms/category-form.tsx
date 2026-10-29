"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { useForm, SubmitHandler } from "react-hook-form";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

// Tipo base para categoría
interface CategoryBase {
  nombre: string;
  descripcion?: string;
  slug: string;
  imagen?: string;
  padre_id?: number | null;
  id_externo?: string;
  enlaceDestacado?: string;
}

// Tipo para categoría existente (con ID)
interface Category extends CategoryBase {
  id: number;
}

// Tipo para formulario de categoría (sin ID para creación)
interface CategoryFormData extends CategoryBase {
  id?: number;
}

interface CategoryFormProps {
  categoria?: Category;
  mode?: "create" | "edit" | "create-subcategory";
  parentId?: number;
  parentName?: string;
  onSubmit?: (data: CategoryFormData) => Promise<void>;
  triggerButton?: React.ReactElement;
  /** Modo controlado: permite abrir el diálogo desde fuera (p. ej. un menú de acciones) */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

const CategoryForm: React.FC<CategoryFormProps> = ({
  categoria,
  mode = "create",
  parentId,
  parentName,
  onSubmit,
  triggerButton,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (value: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(value);
    onOpenChange?.(value);
  };
  const [categoriasPadre, setCategoriasPadre] = useState<Category[]>([]);
  const [loadingPadres, setLoadingPadres] = useState(false);

  const form = useForm<CategoryFormData>({
    defaultValues: {
      nombre: categoria?.nombre || "",
      descripcion: categoria?.descripcion || "",
      slug: categoria?.slug || "",
      imagen: categoria?.imagen || "",
      padre_id: categoria?.padre_id || (mode === "create-subcategory" ? parentId : null),
      enlaceDestacado: categoria?.enlaceDestacado || "",
    },
  });

  // Función para generar slug automáticamente
  const generateSlug = (texto: string): string => {
    return texto
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/--+/g, '-');
  };

  // Función para cargar categorías padre (nivel 2)
  const fetchCategoriasPadre = async () => {
    try {
      setLoadingPadres(true);
      const response = await fetch('/api/categories');
      if (!response.ok) {
        throw new Error('Error al cargar categorías padre');
      }
      const data = await response.json();
      
      // Filtrar solo categorías que no tienen padre (nivel 2)
      const categoriasPadre = data.filter((cat: Category) => cat.padre_id === null);
      setCategoriasPadre(categoriasPadre);
    } catch (error) {
      console.error('Error fetching parent categories:', error);
      toast.error("Error al cargar categorías padre");
    } finally {
      setLoadingPadres(false);
    }
  };

  // Cargar categorías padre cuando se abre el modal
  useEffect(() => {
    if (open) {
      fetchCategoriasPadre();
    }
  }, [open]);

  // Observar cambios en el nombre para generar slug automáticamente
  const nombre = form.watch("nombre");
  useEffect(() => {
    if (nombre && (mode === "create" || mode === "create-subcategory")) {
      const slug = generateSlug(nombre);
      form.setValue("slug", slug);
    }
  }, [nombre, mode, form]);

  const handleSubmit: SubmitHandler<CategoryFormData> = async (data) => {
    try {
      // Si padre_id está vacío, convertir a null
      if (data.padre_id === undefined || data.padre_id === 0) {
        data.padre_id = null;
      }
      
      // Para creación, no enviamos el id. Para edición, lo incluimos
      const submitData: CategoryFormData = mode === "edit" 
        ? { ...data, id: categoria?.id }
        : { ...data };
      
      await onSubmit?.(submitData);
      setOpen(false);
      form.reset();
      toast.success(
        mode === "edit" 
          ? "Categoría actualizada exitosamente" 
          : mode === "create-subcategory"
          ? "Subcategoría creada exitosamente"
          : "Categoría creada exitosamente"
      );
    } catch (error) {
      console.error('Error submitting form:', error);
      toast.error(error instanceof Error && error.message ? error.message : "Error al guardar la categoría");
    }
  };

  const getButtonIcon = () => {
    if (mode === "edit") return Pencil;
    return Plus;
  };

  const getButtonText = () => {
    if (mode === "edit") return "Editar";
    if (mode === "create-subcategory") return "Subcategoría";
    return "Nueva Categoría";
  };

  const getDialogTitle = () => {
    if (mode === "edit") return "Editar Categoría";
    if (mode === "create-subcategory") return `Crear Subcategoría para ${parentName}`;
    return "Crear Nueva Categoría";
  };

  const ButtonIcon = getButtonIcon();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && <DialogTrigger asChild>
        {triggerButton || (
          mode === "edit" ? (
            <Button variant="ghost" size="icon">
              <ButtonIcon className="h-4 w-4" />
            </Button>
          ) : mode === "create-subcategory" ? (
            <Button variant="ghost" size="sm" className="h-7 sm:h-8 px-2">
              <ButtonIcon className="h-3 w-3 mr-1" />
              <span className="text-xs hidden sm:inline">Subcategoría</span>
              <span className="text-xs sm:hidden">Sub</span>
            </Button>
          ) : (
            <Button>
              <ButtonIcon className="mr-2 h-4 w-4" />
              {getButtonText()}
            </Button>
          )
        )}
      </DialogTrigger>}
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {getDialogTitle()}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            
            {/* Categoría Padre */}
            <FormField
              control={form.control}
              name="padre_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoría Padre {mode === "create-subcategory" ? "" : "(opcional)"}</FormLabel>
                  <Select 
                    onValueChange={(value) => field.onChange(value === "null" ? null : parseInt(value))}
                    defaultValue={field.value ? field.value.toString() : "null"}
                    disabled={loadingPadres || mode === "create-subcategory"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar categoría padre" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {mode !== "create-subcategory" && (
                        <SelectItem value="null">Sin categoría padre (Nivel 2)</SelectItem>
                      )}
                      {categoriasPadre.map((categoria) => (
                        <SelectItem key={categoria.id} value={categoria.id!.toString()}>
                          {categoria.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                  {mode === "create-subcategory" && parentName && (
                    <p className="text-sm text-muted-foreground">
                      Esta subcategoría será creada bajo: <strong>{parentName}</strong>
                    </p>
                  )}
                </FormItem>
              )}
            />

            {/* Nombre */}
            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre *</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Ej: Computadores de Escritorio" 
                      {...field} 
                      required
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Descripción */}
            <FormField
              control={form.control}
              name="descripcion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descripción de la categoría..."
                      className="resize-none"
                      rows={3}
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Slug */}
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug *</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="computadores-escritorio" 
                      {...field} 
                      required
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Imagen URL */}
            <FormField
              control={form.control}
              name="imagen"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL de Imagen</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="https://ejemplo.com/imagen.jpg" 
                      {...field} 
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Enlace Destacado */}
            <FormField
              control={form.control}
              name="enlaceDestacado"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Enlace Destacado</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="https://ejemplo.com/categoria-especial" 
                      {...field} 
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ID Externo (solo en modo edición) */}
            {mode === "edit" && categoria?.id_externo && (
              <div className="bg-gray-50 p-3 rounded-md">
                <p className="text-sm text-gray-600">
                  <strong>ID Externo:</strong> {categoria.id_externo}
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button type="submit" className="flex-1">
                {mode === "edit" 
                  ? "Actualizar Categoría" 
                  : mode === "create-subcategory"
                  ? "Crear Subcategoría"
                  : "Crear Categoría"
                }
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setOpen(false);
                  form.reset();
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default CategoryForm;