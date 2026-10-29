"use client";

import { PageTitle, pageHeaderLayout } from "@/components/shared/page-header";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash, Images } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface Banner {
  id: number;
  title: string;
  imageUrl: string;
  isActive: boolean;
}

export default function BannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Cargar banners
  useEffect(() => {
    fetchBanners();
  }, []);

  const fetchBanners = async () => {
    try {
      const response = await fetch("/api/banners");
      const data = await response.json();
      console.log("Fetched banners:", data); // Agrega este log
      setBanners(data);
    } catch (error) {
      toast.error("Error loading banners");
    } finally {
      setLoading(false);
    }
  };

  // Eliminar banner
  const handleDelete = async (bannerId: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este banner?")) return;
  
    try {
      const response = await fetch(`/api/banners/${bannerId}`, {
        method: "DELETE",
      });
  
      if (response.ok) {
        toast.success("Banner deleted successfully");
        fetchBanners(); // Recargar la lista
      } else {
        throw new Error("Error deleting banner");
      }
    } catch (error) {
      toast.error("Error deleting banner");
      console.error(error); // Agregar un log para ver el error
    }
  };

  if (loading) {
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className={pageHeaderLayout}>
        <PageTitle title="Banners" icon={Images} description="Imágenes promocionales de la portada y secciones de la tienda" />
        <Button onClick={() => router.push("/dashboard/banners/new")}>
          <Plus className="mr-2 h-4 w-4" />
          Agregar Banner
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {banners.map((banner) => (
          <Card key={banner.id}>
            <CardHeader>
              <CardTitle>{banner.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative aspect-video overflow-hidden rounded-lg">
                <img
                  src={banner.imageUrl}
                  alt={banner.title}
                  className="object-cover w-full h-full"
                />
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <div className="flex items-center">
                <span 
                  className={`h-2 w-2 rounded-full mr-2 ${
                    banner.isActive ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
                <span className="text-sm">
                  {banner.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => router.push(`/dashboard/banners/${banner.id}/edit`)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => handleDelete(String(banner.id))}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}