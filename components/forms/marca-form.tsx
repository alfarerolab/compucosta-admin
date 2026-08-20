"use client";

import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { useForm, SubmitHandler } from "react-hook-form";
import { Plus } from "lucide-react";

// Definimos la interfaz de Marca
interface Marca {
  idmarca?: string; // Se hace opcional para evitar errores
  nombre: string;
  imagen?: string;
}

// Definimos las propiedades que recibe el formulario
interface MarcaFormProps {
  marca?: Marca;
  mode?: "create" | "edit";
  onSubmit?: (data: Omit<Marca, "idmarca">) => Promise<void>; // Excluye idmarca
}

const MarcaForm: React.FC<MarcaFormProps> = ({
  marca,
  mode = "create",
  onSubmit,
}) => {
  const [open, setOpen] = useState(false);

  const form = useForm<Omit<Marca, "idmarca">>({
    defaultValues: {
      nombre: marca?.nombre || "",
      imagen: marca?.imagen || "",
    },
  });

  const handleSubmit: SubmitHandler<Omit<Marca, "idmarca">> = async (data) => {
    await onSubmit?.(data);
    setOpen(false);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {mode === "create" ? "Agregar Marca" : "Editar Marca"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Agregar Marca" : "Editar Marca"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la Marca</FormLabel>
                  <FormControl>
                    <Input placeholder="Ingrese el nombre de la marca" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="imagen"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL de la Imagen</FormLabel>
                  <FormControl>
                    <Input placeholder="https://ejemplo.com/imagen.jpg" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <Button type="submit" className="w-full">
              {mode === "create" ? "Crear" : "Actualizar"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default MarcaForm;
