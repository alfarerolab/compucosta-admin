"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

interface Color {
  id: number;
  nombre: string;
  codigoHex: string;
}

export default function ColorsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [localColors, setLocalColors] = useState<Color[]>([]);

  useEffect(() => {
    const fetchColors = async () => {
      try {
        const response = await axios.get('/api/colors');

        // 🔹 Convertir `codigo_hex` a `codigoHex`
        const formattedColors = response.data.map((color: any) => ({
          id: color.id,
          nombre: color.nombre,
          codigoHex: color.codigo_hex || "#000000", // Si no hay código, usa negro por defecto
        }));

        console.log("Colores procesados:", formattedColors);
        setLocalColors(formattedColors);
      } catch (error) {
        console.error("Error fetching colors:", error);
      }
    };

    fetchColors();
  }, []);

  const onDelete = async (id: number) => {
    try {
      await axios.delete(`/api/colors/${id}`);
      toast({
        title: "Color eliminado",
        description: "El color ha sido eliminado correctamente",
      });
      setLocalColors(localColors.filter(color => color.id !== id));
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Hubo un error al eliminar el color",
      });
    }
  };

  const isValidHex = (hex: string) => /^#([0-9A-Fa-f0-9]{3}|[0-9A-Fa-f0-9]{6})$/i.test(hex);

  return (
    <div className="space-y-4 p-8">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Colores</h2>
        <Button onClick={() => router.push('colors/new')}>
          <Plus className="mr-2 h-4 w-4" />
          Agregar Color
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {localColors.length > 0 ? (
          localColors.map((color) => (
            <Card key={color.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {color.nombre}
                  <div className="flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => router.push(`colors/${color.id}/edit`)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => onDelete(color.id)}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div 
                    className="w-full h-24 rounded-lg border"
                    style={{ backgroundColor: isValidHex(color.codigoHex) ? color.codigoHex : '#ffffff' }} 
                  />
                  <div className="flex justify-between items-center">
                    <code className="bg-gray-100 px-2 py-1 rounded">
                      {color.codigoHex}
                    </code>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div>No hay colores disponibles</div>
        )}
      </div>
    </div>
  );
}
