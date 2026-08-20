// components/forms/servicio-form.tsx

"use client";

import * as z from "zod";
import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import { Trash, ArrowLeft, Upload } from "lucide-react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Heading } from "@/components/ui/heading";
import { AlertModal } from "@/components/modals/alert-modal";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const formSchema = z.object({
  titulo: z.string().min(1, "El título es requerido").max(200, "El título es muy largo"),
  descripcion: z.string().min(1, "La descripción es requerida").max(1000, "La descripción es muy larga"),
  imagenUrl: z.string().min(1, "La imagen es requerida"),
  orden: z.coerce.number().min(0).max(999, "El orden debe ser menor a 1000"),
  activo: z.boolean().default(true),
});

type ServicioFormValues = z.infer<typeof formSchema>;

interface ServicioFormProps {
  initialData: any | null;
}

export const ServicioForm: React.FC<ServicioFormProps> = ({
  initialData
}) => {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadMethod, setUploadMethod] = useState<"url" | "file">("url");

  const title = initialData ? 'Editar servicio' : 'Crear servicio';
  const description = initialData ? 'Editar un servicio.' : 'Agregar un nuevo servicio';
  const toastMessage = initialData ? 'Servicio actualizado.' : 'Servicio creado.';
  const action = initialData ? 'Guardar cambios' : 'Crear';

  const form = useForm<ServicioFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData ? {
      titulo: initialData.titulo || '',
      descripcion: initialData.descripcion || '',
      imagenUrl: initialData.imagenUrl || '',
      orden: initialData.orden || 0,
      activo: initialData.activo ?? true,
    } : {
      titulo: '',
      descripcion: '',
      imagenUrl: '',
      orden: 0,
      activo: true,
    }
  });

  // Efecto para cargar la imagen inicial
  useEffect(() => {
    if (initialData?.imagenUrl) {
      setImagePreview(initialData.imagenUrl);
    }
  }, [initialData]);

  const handleFileUpload = async (file: File) => {
    try {
      setLoading(true);
      
      // Validar el archivo
      if (!file.type.startsWith('image/')) {
        toast.error("Por favor selecciona un archivo de imagen");
        return;
      }

      if (file.size > 5 * 1024 * 1024) { // 5MB
        toast.error("El archivo es muy grande. Máximo 5MB");
        return;
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("uploadType", "servicios");
      
      // Si estás editando un servicio existente, incluir su ID
      if (initialData?.id) {
        formData.append("itemId", initialData.id.toString());
      }

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Error al subir la imagen");
      }

      const data = await response.json();
      
      if (data.path) {
        form.setValue("imagenUrl", data.path);
        setImagePreview(data.path);
        form.trigger("imagenUrl");
        toast.success("Imagen subida correctamente");
      } else {
        throw new Error("No se recibió la ruta de la imagen");
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error(error instanceof Error ? error.message : "Error al subir la imagen");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: ServicioFormValues) => {
    try {
      setLoading(true);
      
      console.log("Datos a enviar:", data);

      const url = initialData 
        ? `/api/servicios/${initialData.id}` 
        : "/api/servicios";

      const response = await fetch(url, {
        method: initialData ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        let errorMessage = "Error al procesar la solicitud";
        
        try {
          const errorData = await response.json();
          console.error("Error response:", errorData);
          
          if (errorData.details) {
            errorMessage = errorData.details;
          } else if (errorData.error) {
            errorMessage = errorData.error;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          }
          
        } catch (parseError) {
          console.error("Could not parse error response:", parseError);
          
          try {
            const errorText = await response.text();
            if (errorText) {
              errorMessage = errorText;
            }
          } catch (textError) {
            console.error("Could not get error text:", textError);
          }
        }
        
        toast.error(errorMessage);
        return;
      }

      const result = await response.json();
      console.log("Success response:", result);
      
      toast.success(toastMessage);
      
      // Navegación simplificada
      router.push("/dashboard/servicios");
      
    } catch (error) {
      console.error("Error en onSubmit:", error);
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

const onDelete = async () => {
  try {
    setLoading(true);
    
    const response = await fetch(`/api/servicios/${initialData.id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.details || errorData.error || 'Error al eliminar');
    }

    toast.success('Servicio eliminado.');
    router.push(`/dashboard/servicios`);
    
  } catch (error) {
    console.error("Error deleting service:", error);
    toast.error(error instanceof Error ? error.message : 'Error al eliminar el servicio.');
  } finally {
    setLoading(false);
    setOpen(false);
  }
};

  return (
    <>
      <AlertModal 
        isOpen={open} 
        onClose={() => setOpen(false)} 
        onConfirm={onDelete}
        loading={loading}
      />
      
      {/* Header con botón de regreso */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Heading title={title} description={description} />
        </div>
        {initialData && (
          <Button
            disabled={loading}
            variant="destructive"
            size="sm"
            onClick={() => setOpen(true)}
          >
            <Trash className="h-4 w-4" />
          </Button>
        )}
      </div>
      
      <Separator />
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 w-full">
          
          {/* Información Básica */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4 text-blue-800">Información del Servicio</h3>
            
            <FormField
              control={form.control}
              name="titulo"
              render={({ field }) => (
                <FormItem className="mb-6">
                  <FormLabel>Título del Servicio *</FormLabel>
                  <FormControl>
                    <Input 
                      disabled={loading} 
                      placeholder="Ej: Mantenimiento de Computadoras" 
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription>
                    Nombre del servicio que aparecerá en el sitio web (máximo 200 caracteres)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="descripcion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción Completa *</FormLabel>
                  <FormControl>
                    <Textarea 
                      disabled={loading} 
                      placeholder="Describe detalladamente el servicio, qué incluye, beneficios, etc..." 
                      className="resize-none" 
                      rows={6}
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription>
                    Descripción completa del servicio para mostrar a los clientes (máximo 1000 caracteres)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Imagen del Servicio */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4 text-purple-800">Imagen del Servicio</h3>
            
            <Tabs value={uploadMethod} onValueChange={(v) => setUploadMethod(v as "url" | "file")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="url">URL</TabsTrigger>
                <TabsTrigger value="file">Subir Archivo</TabsTrigger>
              </TabsList>
              
              <TabsContent value="url">
                <FormField
                  control={form.control}
                  name="imagenUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Imagen URL</FormLabel>
                      <FormControl>
                        <Input 
                          disabled={loading}
                          placeholder="https://ejemplo.com/imagen.jpg" 
                          value={field.value}
                          onChange={(e) => {
                            const newValue = e.target.value;
                            field.onChange(newValue);
                            setImagePreview(newValue);
                            form.trigger("imagenUrl");
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        Pega la URL completa de una imagen desde internet
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>
              
              <TabsContent value="file">
                <FormItem>
                  <FormLabel>Subir Imagen</FormLabel>
                  <FormControl>
                    <div className="flex items-center justify-center w-full">
                      <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <Upload className="w-8 h-8 mb-4 text-gray-500" />
                          <p className="mb-2 text-sm text-gray-500">
                            <span className="font-semibold">Click para subir</span> o arrastra y suelta
                          </p>
                          <p className="text-xs text-gray-500">PNG, JPG, JPEG (máximo 5MB)</p>
                        </div>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*"
                          disabled={loading}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleFileUpload(file);
                            }
                          }}
                        />
                      </label>
                    </div>
                  </FormControl>
                  <FormDescription>
                    Sube una imagen desde tu computadora. Formatos permitidos: PNG, JPG, JPEG (máximo 5MB)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              </TabsContent>
            </Tabs>

            {imagePreview ? (
              <div className="mt-4">
                <p className="text-sm font-medium mb-2">Vista previa:</p>
                <div className="relative w-full h-48">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="rounded-lg object-cover w-full h-full"
                    onError={() => {
                      setImagePreview(null);
                      toast.error("Error al cargar la imagen");
                    }}
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 mt-4">No hay imagen para previsualizar</p>
            )}
          </div>

          {/* Configuración */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">Configuración</h3>
            
            <div className="md:grid md:grid-cols-2 gap-8">
              <FormField
                control={form.control}
                name="orden"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Orden de Aparición</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        disabled={loading} 
                        placeholder="0" 
                        min="0"
                        max="999"
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Número para ordenar (0 = primero, 1 = segundo, etc.)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="activo"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={loading}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Mostrar en el sitio web
                      </FormLabel>
                      <FormDescription>
                        Si está marcado, el servicio aparecerá en el sitio web
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </div>
          </div>
          
          <Button disabled={loading} className="ml-auto" type="submit">
            {loading ? "Guardando..." : action}
          </Button>
        </form>
      </Form>
    </>
  );
};