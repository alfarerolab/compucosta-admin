"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { ArrowLeft, Upload } from "lucide-react";

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  imageUrl: z.string().min(1, "Image is required"),
  isActive: z.boolean().default(true),
  bannerType: z.enum(["bannerPrincipal", "bannerSegundario", "bannerContacto"], {
    required_error: "Por favor seleccione un tipo de banner",
  }),
});

type BannerFormValues = z.infer<typeof formSchema>;

interface BannerFormProps {
  initialData?: BannerFormValues & {
    id: number;
  };
}

const BANNER_TYPE_LABELS: Record<string, string> = {
  bannerPrincipal: "Banner Principal",
  bannerSegundario: "Banner Segundario",
  bannerContacto: "Banner Contacto",
};

export default function BannerForm({ initialData }: BannerFormProps) {
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadMethod, setUploadMethod] = useState<"url" | "file">("url");
  const router = useRouter();

  const form = useForm<BannerFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData ?? {
      title: "",
      imageUrl: "",
      isActive: true,
      bannerType: "bannerPrincipal",
    },
  });

  useEffect(() => {
    if (initialData?.imageUrl) {
      setImagePreview(initialData.imageUrl);
    }
  }, [initialData]);

  const handleFileUpload = async (file: File) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("uploadType", "banners");
      
      // Si estás editando un banner existente, puedes incluir su ID
      if (initialData?.id) {
        formData.append("itemId", initialData.id.toString());
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
        form.setValue("imageUrl", data.path);
        setImagePreview(data.path);
      } else {
        throw new Error("No se recibió la ruta de la imagen");
      }
    } catch (error) {
      toast.error("Error al subir la imagen");
      console.error(error);
    }
  };

  const onSubmit = async (data: BannerFormValues) => {
    try {
      setLoading(true);
      
      // Debug: Ver qué datos se están enviando
      console.log("Datos a enviar:", data);
  
      const url = initialData 
        ? `/api/banners/${initialData.id}` 
        : "/api/banners";
  
      const response = await fetch(url, {
        method: initialData ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
  
      if (!response.ok) {
        let errorMessage = "algo salió mal";
        try {
          const errorData = await response.json();
          console.error("Error response:", errorData);
          errorMessage = errorData.error || errorData.details || errorMessage;
        } catch (parseError) {
          // Si no se puede parsear como JSON, intentar como texto
          try {
            const errorText = await response.text();
            console.error("Error response (text):", errorText);
            errorMessage = errorText || errorMessage;
          } catch (textError) {
            console.error("Could not parse error response:", textError);
          }
        }
        
        toast.error(errorMessage);
        throw new Error(errorMessage);
      }
  
      toast.success(initialData ? "Banner actualizado correctamente" : "Banner creado correctamente");
      router.push("/dashboard/banners");
      router.refresh();
    } catch (error) {
      console.error("Error en onSubmit:", error);
      // Solo mostrar toast si no se mostró uno específico antes
      if (!(error instanceof Error && error.message !== "algo salió mal")) {
        toast.error("algo salió mal");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-3xl font-bold tracking-tight">
            {initialData ? "Editar Banner" : "Crear Banner"}
          </h2>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Información Banner</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="bannerType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Banner</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo de banner">
                          {BANNER_TYPE_LABELS[field.value] ?? "Seleccionar tipo de banner"}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="bannerPrincipal">Banner Principal</SelectItem>
                      <SelectItem value="bannerSegundario">Banner Segundario</SelectItem>
                      <SelectItem value="bannerContacto">Banner Contacto</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Titulo Banner" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Tabs value={uploadMethod} onValueChange={(v) => setUploadMethod(v as "url" | "file")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="url">URL</TabsTrigger>
                  <TabsTrigger value="file">Subir Archivo</TabsTrigger>
                </TabsList>
                <TabsContent value="url">
                  <FormField
                    control={form.control}
                    name="imageUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Imagen URL</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Imagen URL" 
                            value={field.value}
                            onChange={(e) => {
                              const newValue = e.target.value;
                              field.onChange(newValue);
                              setImagePreview(newValue);
                              // Forzar validación del campo
                              form.trigger("imageUrl");
                            }}
                          />
                        </FormControl>
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
                          </div>
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
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
                    <FormMessage />
                  </FormItem>
                </TabsContent>
              </Tabs>

              {imagePreview ? (
                <div className="mt-4">
                  <p className="text-sm font-medium mb-2">Vista previa:</p>
                  <div className="relative w-full h-48">
                    <img
                      src={imagePreview || undefined}
                      alt="Preview"
                      className="rounded-lg object-cover w-full h-full"
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">No hay imagen para previsualizar</p>
              )}

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Activo</FormLabel>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex justify-end">
                <Button disabled={loading} type="submit">
                  {initialData ? "Guardar Cambios" : "Crear"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}