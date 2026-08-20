// components/forms/contacto-form.tsx

"use client";

import * as z from "zod";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import { Trash } from "lucide-react";
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
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, ArrowLeft } from "lucide-react";

const formSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  tipo: z.string().min(1, "El tipo es requerido"),
  direccion: z.string().optional(),
  telefono: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  horario: z.string().optional(),
  latitud: z.coerce.number().optional(),
  longitud: z.coerce.number().optional(),
  imagenUrl: z.string().optional(),
  rol: z.string().optional(),
  sedeId: z.string().optional(),
  orden: z.coerce.number().min(0),
  activo: z.boolean().default(true),
}).refine((data) => {
  // Validaciones condicionales según el tipo
  if (data.tipo === "sede") {
    if (!data.direccion || data.direccion.trim() === "") return false;
    if (!data.horario || data.horario.trim() === "") return false;
    if (!data.imagenUrl || data.imagenUrl.trim() === "") return false;
    if (data.latitud === undefined || data.longitud === undefined) return false;
  }
  if (data.tipo === "personal") {
    if (!data.rol || data.rol.trim() === "") return false;
    if (!data.sedeId || data.sedeId.trim() === "") return false;
  }
  return true;
}, {
  message: "Campos requeridos faltantes según el tipo seleccionado",
  path: ["tipo"],
});

type ContactoFormValues = z.infer<typeof formSchema>;

interface ContactoFormProps {
  initialData: any | null;
  sedes: any[];
}

// Roles disponibles para personal
const rolesDisponibles = [
  { value: "Asesor Comercial", label: "Asesor Comercial" },
  { value: "Técnico Especializado", label: "Técnico Especializado" },
  { value: "Gerente", label: "Gerente" },
  { value: "Coordinador", label: "Coordinador" },
  { value: "Recepcionista", label: "Recepcionista" },
  { value: "Soporte Técnico", label: "Soporte Técnico" }
];

export const ContactoForm: React.FC<ContactoFormProps> = ({
  initialData,
  sedes
}) => {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(initialData?.imagenUrl || null);
  const [uploadMethod, setUploadMethod] = useState<"url" | "file">("url");
  
  const title = initialData ? 'Editar contacto' : 'Crear contacto';
  const description = initialData ? 'Editar información de contacto.' : 'Agregar nueva información de contacto';
  const toastMessage = initialData ? 'Contacto actualizado.' : 'Contacto creado.';
  const action = initialData ? 'Guardar cambios' : 'Crear';

  const form = useForm<ContactoFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData ? {
      ...initialData,
      orden: initialData?.orden || 0,
      activo: initialData?.activo ?? true,
      latitud: initialData?.latitud || undefined,
      longitud: initialData?.longitud || undefined,
    } : {
      nombre: '',
      tipo: '',
      direccion: '',
      telefono: '',
      whatsapp: '',
      email: '',
      horario: '',
      latitud: undefined,
      longitud: undefined,
      imagenUrl: '',
      rol: '',
      sedeId: '',
      orden: 0,
      activo: true,
    }
  });

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
      formData.append("uploadType", "contactos");
      
      // Si estás editando un contacto existente, incluir su ID
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

  const onSubmit = async (data: ContactoFormValues) => {
    try {
      setLoading(true);
      
      console.log("Datos a enviar:", data);
      
      const url = initialData 
        ? `/api/contactos/${initialData.id}` 
        : `/api/contactos`;
      
      const method = initialData ? 'PATCH' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
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
      router.push(`/dashboard/contactos`);
      
    } catch (error: any) {
      console.error("Error en onSubmit:", error);
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`/api/contactos/${initialData.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || 'Error al eliminar');
      }

      toast.success('Contacto eliminado.');
      router.push(`/dashboard/contactos`);
      
    } catch (error: any) {
      console.error("Error deleting contact:", error);
      toast.error(error instanceof Error ? error.message : 'Error al eliminar el contacto.');
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  const tipoSeleccionado = form.watch("tipo");

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
          
          {/* Selector de Tipo */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">Tipo de Información</h3>
            <FormField
              control={form.control}
              name="tipo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>¿Qué tipo de información vas a agregar?</FormLabel>
                  <Select 
                    disabled={loading} 
                    onValueChange={(value) => {
                      field.onChange(value);
                      // Limpiar campos cuando cambia el tipo
                      if (value !== "sede") {
                        form.setValue("direccion", "");
                        form.setValue("imagenUrl", "");
                        form.setValue("latitud", undefined);
                        form.setValue("longitud", undefined);
                        setImagePreview(null);
                      }
                      if (value !== "personal") {
                        form.setValue("rol", "");
                        form.setValue("sedeId", "");
                      }
                    }} 
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona el tipo de información" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="sede">🏢 Sede / Sucursal</SelectItem>
                      <SelectItem value="personal">👤 Personal / Empleado</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {tipoSeleccionado === "sede" && "Información sobre ubicaciones físicas de la empresa"}
                    {tipoSeleccionado === "personal" && "Información sobre empleados y personal de atención"}
                    {!tipoSeleccionado && "Selecciona qué tipo de información deseas agregar"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Campos que aparecen según el tipo seleccionado */}
          {tipoSeleccionado && (
            <>
              {/* Información Básica */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4 text-blue-800">
                  {tipoSeleccionado === "sede" ? "Información de la Sede" : "Información del Personal"}
                </h3>
                
                <FormField
                  control={form.control}
                  name="nombre"
                  render={({ field }) => (
                    <FormItem className="mb-6">
                      <FormLabel>
                        {tipoSeleccionado === "sede" ? "Nombre de la Sede *" : "Nombre Completo *"}
                      </FormLabel>
                      <FormControl>
                        <Input 
                          disabled={loading} 
                          placeholder={
                            tipoSeleccionado === "sede" 
                              ? "SEDE PRINCIPAL COMPUTADORES DE LA COSTA" 
                              : "Juan Pérez"
                          } 
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        {tipoSeleccionado === "sede" 
                          ? "Nombre descriptivo y distintivo de la sede" 
                          : "Nombre completo de la persona"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Campos específicos para SEDE */}
                {tipoSeleccionado === "sede" && (
                  <>
                    <FormField
                      control={form.control}
                      name="direccion"
                      render={({ field }) => (
                        <FormItem className="mb-6">
                          <FormLabel>Dirección Completa *</FormLabel>
                          <FormControl>
                            <Textarea 
                              disabled={loading} 
                              placeholder="Cr20 19-09 Ford, Sincelejo, Sucre" 
                              className="resize-none" 
                              rows={3}
                              {...field} 
                            />
                          </FormControl>
                          <FormDescription>
                            Dirección completa y detallada de la ubicación
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="horario"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Horario de Atención *</FormLabel>
                          <FormControl>
                            <Input disabled={loading} placeholder="Lunes a Viernes: 8am - 6pm" {...field} />
                          </FormControl>
                          <FormDescription>
                            Horario completo de atención al público
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {/* Campos específicos para PERSONAL */}
                {tipoSeleccionado === "personal" && (
                  <>
                    <div className="grid md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="rol"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cargo / Rol *</FormLabel>
                            <Select disabled={loading} onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecciona el cargo" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {rolesDisponibles.map((rol) => (
                                  <SelectItem key={rol.value} value={rol.value}>
                                    {rol.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {sedes.length > 0 && (
                        <FormField
                          control={form.control}
                          name="sedeId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Sede Asignada *</FormLabel>
                              <Select disabled={loading} onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecciona una sede" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {sedes.map((sede) => (
                                    <SelectItem key={sede.id} value={sede.id}>
                                      {sede.nombre}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Imagen (solo para sedes) */}
              {tipoSeleccionado === "sede" && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold mb-4 text-purple-800">Imagen de la Sede</h3>
                  
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
                        <FormLabel>Subir Imagen *</FormLabel>
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
              )}

              {/* Información de Contacto */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4 text-green-800">Información de Contacto</h3>
                
                <div className="grid md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="telefono"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Teléfono</FormLabel>
                        <FormControl>
                          <Input disabled={loading} placeholder="+57 5 282 1234" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="whatsapp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>WhatsApp</FormLabel>
                        <FormControl>
                          <Input disabled={loading} placeholder="+57 300 123 4567" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="mt-6">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input disabled={loading} placeholder="contacto@empresa.com" type="email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Ubicación en el Mapa (solo para sedes) */}
              {tipoSeleccionado === "sede" && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold mb-4 text-yellow-800">Ubicación en el Mapa</h3>
                  <p className="text-sm text-yellow-700 mb-4">
                    Coordenadas GPS para mostrar la sede en el mapa interactivo
                  </p>
                  
                  <div className="grid md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="latitud"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Latitud *</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              step="any"
                              disabled={loading} 
                              placeholder="9.3040768" 
                              {...field} 
                            />
                          </FormControl>
                          <FormDescription>
                            Coordenada Norte-Sur (ej: 9.3040768)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="longitud"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Longitud *</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              step="any"
                              disabled={loading} 
                              placeholder="-75.3942819" 
                              {...field} 
                            />
                          </FormControl>
                          <FormDescription>
                            Coordenada Este-Oeste (ej: -75.3942819)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="mt-4 p-4 bg-yellow-100 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      <strong>💡 Tip:</strong> Puedes obtener las coordenadas exactas desde Google Maps:
                      <br />1. Busca la dirección en Google Maps
                      <br />2. Haz clic derecho en la ubicación exacta  
                      <br />3. Selecciona las coordenadas que aparecen en el menú
                    </p>
                  </div>
                </div>
              )}

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
                            {tipoSeleccionado === "sede" ? "Sede Activa" : "Personal Activo"}
                          </FormLabel>
                          <FormDescription>
                            {tipoSeleccionado === "sede" 
                              ? "Esta sede aparecerá en el sitio web y en el mapa." 
                              : "Esta persona aparecerá en el equipo de atención."}
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
            </>
          )}
        </form>
      </Form>
      <br />
    </>
  );
};