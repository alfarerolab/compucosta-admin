"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Trash, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";
import MarcaForm from "@/components/forms/marca-form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePagination } from "@/hooks/usePagination";
import Pagination from "@/components/ui/pagination";

// ✅ Interfaz con AMBOS IDs claramente definidos
interface Marca {
  id: number;          
  idmarca: number;    
  nombre: string;
  imagen?: string;
  enBD?: boolean;
  estado?: string;
}

export default function MarcasPage() {
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [marcaToDelete, setMarcaToDelete] = useState<Marca | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredMarcas = marcas.filter((marca) =>
    marca.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(marca.idmarca).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pagination = usePagination({
    data: filteredMarcas,
    initialItemsPerPage: 10,
    initialPage: 1
  });

  useEffect(() => {
    fetchMarcas();
  }, []);

  useEffect(() => {
    pagination.goToPage(1);
  }, [searchTerm]);

  const fetchMarcas = async (updateLoadingState = true) => {
    try {
      if (updateLoadingState) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      // Obtener marcas desde la BD
      const dbResponse = await fetch("/api/marcas");
      const dataBD = await dbResponse.json();

      if (!dbResponse.ok) {
        throw new Error(dataBD.error || "Error al cargar marcas de BD");
      }

      if (!Array.isArray(dataBD.marcas)) {
        throw new Error("La API /api/marcas no devolvió un array.");
      }

      console.log("📦 Marcas desde BD:", dataBD.marcas);

      // Intentar sincronizar con la API externa
      try {
        const apiResponse = await fetch("/api/marcas/sync");
        const syncData = await apiResponse.json();

        if (apiResponse.ok && Array.isArray(syncData.marcas)) {
          // Combinar datos de BD con API externa
          const marcasCombinadas = syncData.marcas.map((marcaAPI: any) => {
            const marcaBD = dataBD.marcas.find((m: any) => m.idmarca === marcaAPI.idmarca);

            return {
              id: marcaBD?.id || 0,
              idmarca: marcaAPI.idmarca,
              nombre: marcaBD?.nombre || marcaAPI.nombre,
              imagen: marcaBD?.imagen || "",
              enBD: !!marcaBD,
              estado: marcaBD ? "✅ Sincronizada" : "⚠️ No guardada",
            };
          });

          // Agregar marcas locales que no están en la API externa
          const marcasLocales = dataBD.marcas.filter((marcaBD: any) => 
            !syncData.marcas.some((marcaAPI: any) => marcaAPI.idmarca === marcaBD.idmarca)
          );

          const todasLasMarcas = [
            ...marcasCombinadas,
            ...marcasLocales.map((m: any) => ({
              id: m.id,
              idmarca: m.idmarca,
              nombre: m.nombre,
              imagen: m.imagen || "",
              enBD: true,
              estado: "📍 Local"
            }))
          ];

          console.log("✅ Total de marcas combinadas:", todasLasMarcas.length);
          setMarcas(todasLasMarcas);
        } else {
          // Si falla sync, usar solo BD
          setMarcas(dataBD.marcas.map((m: any) => ({
            ...m,
            enBD: true,
            estado: "✅ Guardada"
          })));
        }
      } catch (syncError) {
        console.warn("⚠️ Error en sincronización, usando solo datos de BD:", syncError);
        setMarcas(dataBD.marcas.map((m: any) => ({
          ...m,
          enBD: true,
          estado: "✅ Guardada"
        })));
      }

      if (!updateLoadingState && !refreshing) {
        toast.success("Datos actualizados");
      }
    } catch (error) {
      console.error("❌ Error en fetchMarcas:", error);
      toast.error(`Error: ${error instanceof Error ? error.message : "Error desconocido"}`);
    } finally {
      if (updateLoadingState) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  };

  const handleRefresh = () => {
    fetchMarcas(true);
  };

  const handleCreate = async (data: Omit<Marca, "id" | "idmarca">) => {
    try {
      console.log("📤 Creando marca:", data);
      
      const response = await fetch("/api/marcas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const responseData = await response.json();
      console.log("📥 Respuesta:", responseData);

      if (!response.ok) {
        throw new Error(responseData.error || "Error al crear la marca");
      }

      toast.success("Marca creada correctamente");
      fetchMarcas();
    } catch (error) {
      console.error("❌ Error creando marca:", error);
      toast.error(error instanceof Error ? error.message : "Error al crear la marca");
      throw error;
    }
  };

  // ✅ CORREGIDO: Usar idmarca como identificador
  const handleUpdate = async (idmarca: number, data: Omit<Marca, "id" | "idmarca">) => {
    try {
      console.log(`📝 Actualizando marca idmarca=${idmarca}:`, data);
      
      const response = await fetch(`/api/marcas/${idmarca}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const responseData = await response.json();
      
      if (!response.ok) {
        throw new Error(responseData.error || "Error al actualizar la marca");
      }

      console.log("✅ Marca actualizada:", responseData);
      toast.success("Marca actualizada correctamente");
      fetchMarcas();
    } catch (error) {
      console.error("❌ Error actualizando marca:", error);
      toast.error(error instanceof Error ? error.message : "Error al actualizar la marca");
    }
  };

  // ✅ CORREGIDO: Usar idmarca como identificador
  const handleDelete = async (idmarca: number) => {
    try {
      console.log(`🗑️ Eliminando marca idmarca=${idmarca}`);
      
      const response = await fetch(`/api/marcas/${idmarca}`, {
        method: "DELETE",
      });
      
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al eliminar la marca");
      }

      console.log("✅ Marca eliminada");
      toast.success("Marca eliminada correctamente");
      fetchMarcas(true);
      setDeleteDialogOpen(false);
      setMarcaToDelete(null);
    } catch (error) {
      console.error("❌ Error eliminando marca:", error);
      toast.error(
        `Error: ${error instanceof Error ? error.message : "Error desconocido"}`
      );
    }
  };

  const clearSearch = () => {
    setSearchTerm("");
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-lg">Cargando marcas...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-8">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Gestión de Marcas</h2>
        <div className="flex space-x-2">
          <Button 
            variant="outline" 
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Actualizando...' : 'Actualizar'}
          </Button>
          <MarcaForm onSubmit={handleCreate} />
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          type="text"
          placeholder="Buscar por nombre o ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 pr-10"
        />
        {searchTerm && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
            onClick={clearSearch}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {filteredMarcas.length === 0 ? (
        <div className="text-center py-10 text-gray-500">
          {searchTerm 
            ? `No se encontraron marcas que coincidan con "${searchTerm}"`
            : "No hay marcas disponibles"
          }
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Marca</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.currentData.map((marca) => (
                  <TableRow key={marca.id}>
                    <TableCell className="font-mono">{marca.idmarca}</TableCell>
                    <TableCell>{marca.nombre}</TableCell>
                    <TableCell>
                      <span className="text-sm">{marca.estado}</span>
                    </TableCell>
                    <TableCell className="text-right flex gap-2 justify-end">
                      <MarcaForm
                        mode="edit"
                        
                        onSubmit={(data) => handleUpdate(marca.idmarca, data)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setMarcaToDelete(marca);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            itemsPerPage={pagination.itemsPerPage}
            totalItems={pagination.totalItems}
            onPageChange={pagination.goToPage}
            onItemsPerPageChange={pagination.setItemsPerPage}
            onNextPage={pagination.goToNextPage}
            onPreviousPage={pagination.goToPreviousPage}
            canGoNext={pagination.canGoNext}
            canGoPrevious={pagination.canGoPrevious}
            getPageNumbers={pagination.getPageNumbers}
            getPaginationInfo={pagination.getPaginationInfo}
          />
        </>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente la marca "{marcaToDelete?.nombre}".
              {marcaToDelete?.estado === "📍 Local" && (
                <div className="mt-2 text-yellow-600">
                  ⚠️ Esta es una marca local (no sincronizada con API externa)
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setDeleteDialogOpen(false);
              setMarcaToDelete(null);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => marcaToDelete && handleDelete(marcaToDelete.idmarca)}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}