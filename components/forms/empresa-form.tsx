// components/forms/empresa-form.tsx

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
import { Heading } from "../ui/heading";
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

const formSchema = z.object({
  seccion: z.string().min(1, "La sección es requerida"),
  tipo: z.string().min(1, "El tipo es requerido"),
  titulo: z.string().min(1, "El título es requerido"),
  descripcion: z.string().min(1, "La descripción es requerida"),
  icono: z.string().optional(),
  orden: z.coerce.number().min(0),
  activo: z.boolean().default(true),
  metadatos: z.object({
    ano: z.string().optional(),
    importancia: z.string().optional(),
  }).optional(),
}).refine((data) => {
  // Si es un valor corporativo, el icono es requerido
  if (data.tipo === "valor" && (!data.icono || data.icono.trim() === "")) {
    return false;
  }
  return true;
}, {
  message: "Los valores corporativos requieren un icono",
  path: ["icono"],
});

type EmpresaFormValues = z.infer<typeof formSchema>;

interface EmpresaFormProps {
  initialData: any | null;
}

// Lista de iconos disponibles para valores e hitos con nombres en español
const iconosDisponibles = [
  { value: "Target", label: "Objetivo" },
  { value: "Compass", label: "Brújula" },
  { value: "Heart", label: "Corazón" },
  { value: "Lightbulb", label: "Bombilla" },
  { value: "Shield", label: "Escudo" },
  { value: "Star", label: "Estrella" },
  { value: "Award", label: "Premio" },
  { value: "Users", label: "Usuarios" },
  { value: "Clock", label: "Reloj" },
  { value: "CheckCircle", label: "Verificado" },
  { value: "Trophy", label: "Trofeo" },
  { value: "Zap", label: "Rayo" },
  { value: "Globe", label: "Globo" },
  { value: "Rocket", label: "Cohete" },
  { value: "Eye", label: "Ojo" },
  { value: "HandHeart", label: "Mano con Corazón" },
  { value: "Crown", label: "Corona" },
  { value: "Diamond", label: "Diamante" }
];

export const EmpresaForm: React.FC<EmpresaFormProps> = ({
  initialData
}) => {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const title = initialData ? 'Editar información' : 'Crear información';
  const description = initialData ? 'Editar información de la empresa.' : 'Agregar nueva información de la empresa';
  const toastMessage = initialData ? 'Información actualizada.' : 'Información creada.';
  const action = initialData ? 'Guardar cambios' : 'Crear';

  const form = useForm<EmpresaFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData ? {
      seccion: initialData.seccion || '',
      tipo: initialData.tipo || '',
      titulo: initialData.titulo || '',
      descripcion: initialData.descripcion || '',
      icono: initialData.icono || '',
      orden: initialData.orden || 0,
      activo: initialData.activo ?? true,
      metadatos: {
        ano: initialData.metadatos?.ano || '',
        importancia: initialData.metadatos?.importancia || '',
      },
    } : {
      seccion: '',
      tipo: '',
      titulo: '',
      descripcion: '',
      icono: '',
      orden: 0,
      activo: true,
      metadatos: {
        ano: '',
        importancia: '',
      },
    }
  });

  const onSubmit = async (data: EmpresaFormValues) => {
    try {
      setLoading(true);
      
      // Limpiar metadatos vacíos
      const metadatosLimpios = data.metadatos && Object.keys(data.metadatos).length > 0 
        ? Object.fromEntries(
            Object.entries(data.metadatos).filter(([_, value]) => value !== '' && value !== undefined)
          )
        : null;

      const dataToSend = {
        ...data,
        metadatos: metadatosLimpios,
      };

      console.log("Datos a enviar:", dataToSend); // Debug

      const url = initialData 
        ? `/api/empresa/${initialData.id}` 
        : "/api/empresa";

      const response = await fetch(url, {
        method: initialData ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSend),
      });

      if (!response.ok) {
        let errorMessage = "Error al procesar la solicitud";
        
        try {
          const errorData = await response.json();
          console.error("Error response:", errorData);
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch (parseError) {
          console.error("Could not parse error response:", parseError);
          
          try {
            const errorText = await response.text();
            console.error("Error response (text):", errorText);
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
      console.log("Success response:", result); // Debug
      
      toast.success(toastMessage);
      router.push(`/dashboard/empresa`);
      
    } catch (error: any) {
      console.error("Error en onSubmit:", error);
      toast.error(error.message || 'Algo salió mal.');
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`/api/empresa/${initialData.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Error al eliminar');
      }

      toast.success('Información eliminada.');
      router.push(`/dashboard/empresa`);
      
    } catch (error: any) {
      console.error("Error deleting empresa info:", error);
      toast.error(error.message || 'Algo salió mal.');
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  const seccionSeleccionada = form.watch("seccion");
  const tipoSeleccionado = form.watch("tipo");

  return (
    <>
      <AlertModal 
        isOpen={open} 
        onClose={() => setOpen(false)} 
        onConfirm={onDelete}
        loading={loading}
      />
      <div className="flex items-center justify-between">
        <Heading title={title} description={description} />
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
          <div className="md:grid md:grid-cols-3 gap-8">
            <FormField
              control={form.control}
              name="seccion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sección</FormLabel>
                  <Select 
                    disabled={loading} 
                    onValueChange={(value) => {
                      field.onChange(value);
                      // Establecer tipo automáticamente según la sección
                      let tipoAutomatico = "texto";
                      if (value === "historia") tipoAutomatico = "hito";
                      if (value === "valores") tipoAutomatico = "valor";
                      form.setValue("tipo", tipoAutomatico);
                      
                      // Limpiar icono si no es necesario
                      if (tipoAutomatico === "texto") {
                        form.setValue("icono", "");
                      }
                    }} 
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona una sección" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="mision">Misión</SelectItem>
                      <SelectItem value="vision">Visión</SelectItem>
                      <SelectItem value="historia">Historia</SelectItem>
                      <SelectItem value="valores">Valores</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tipo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select disabled={true} onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-gray-100">
                        <SelectValue placeholder="Se establece automáticamente" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="texto">Texto</SelectItem>
                      <SelectItem value="hito">Hito</SelectItem>
                      <SelectItem value="valor">Valor</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {seccionSeleccionada === "mision" || seccionSeleccionada === "vision" 
                      ? "Automático: Texto (para contenido descriptivo)" 
                      : seccionSeleccionada === "historia" 
                      ? "Automático: Hito (para eventos históricos)" 
                      : seccionSeleccionada === "valores" 
                      ? "Automático: Valor (para principios corporativos)"
                      : "El tipo se establece según la sección seleccionada"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {(tipoSeleccionado === "valor" || tipoSeleccionado === "hito") && (
              <FormField
                control={form.control}
                name="icono"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Icono {tipoSeleccionado === "valor" ? "(Requerido)" : "(Opcional)"}</FormLabel>
                    <Select disabled={loading} onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un icono" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {iconosDisponibles.map((icono) => (
                          <SelectItem key={icono.value} value={icono.value}>
                            {icono.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {tipoSeleccionado === "valor" 
                        ? "Los valores corporativos requieren un icono representativo" 
                        : "Los hitos históricos pueden incluir un icono opcional"}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>

          <FormField
            control={form.control}
            name="titulo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Título</FormLabel>
                <FormControl>
                  <Input disabled={loading} placeholder="Título del elemento" {...field} />
                </FormControl>
                <FormDescription>
                  {seccionSeleccionada === "mision" && "Título para la sección de misión"}
                  {seccionSeleccionada === "vision" && "Título para la sección de visión"}
                  {seccionSeleccionada === "historia" && tipoSeleccionado === "hito" && "Nombre del hito histórico"}
                  {seccionSeleccionada === "valores" && tipoSeleccionado === "valor" && "Nombre del valor corporativo"}
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
                <FormLabel>Descripción</FormLabel>
                <FormControl>
                  <Textarea 
                    disabled={loading} 
                    placeholder="Descripción detallada" 
                    className="resize-none" 
                    rows={6}
                    {...field} 
                  />
                </FormControl>
                <FormDescription>
                  {seccionSeleccionada === "mision" && "Descripción de la misión de la empresa"}
                  {seccionSeleccionada === "vision" && "Descripción de la visión de la empresa"}
                  {seccionSeleccionada === "historia" && tipoSeleccionado === "hito" && "Descripción de lo que ocurrió en este período"}
                  {seccionSeleccionada === "valores" && tipoSeleccionado === "valor" && "Explicación del valor y su importancia"}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {seccionSeleccionada === "historia" && tipoSeleccionado === "hito" && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4 text-blue-800">Información adicional del hito</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Año (opcional)</label>
                  <Input 
                    disabled={loading} 
                    placeholder="2010" 
                    type="number"
                    value={form.watch("metadatos.ano") || ''}
                    onChange={(e) => form.setValue("metadatos.ano", e.target.value)}
                  />
                  <p className="text-xs text-gray-500">Año en que ocurrió este hito</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Nivel de importancia</label>
                  <Select 
                    disabled={loading} 
                    onValueChange={(value) => form.setValue("metadatos.importancia", value)} 
                    value={form.watch("metadatos.importancia") || ''}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona importancia" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="media">Media</SelectItem>
                      <SelectItem value="baja">Baja</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          <div className="md:grid md:grid-cols-2 gap-8">
            <FormField
              control={form.control}
              name="orden"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Orden</FormLabel>
                  <FormControl>
                    <Input type="number" disabled={loading} placeholder="0" {...field} />
                  </FormControl>
                  <FormDescription>
                    Orden de aparición en la sección (menor número aparece primero)
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
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>
                      Activo
                    </FormLabel>
                    <FormDescription>
                      Esta información aparecerá en el sitio web.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </div>
          <Button disabled={loading} className="ml-auto" type="submit">
            {action}
          </Button>
        </form>
      </Form>
    </>
  );
};