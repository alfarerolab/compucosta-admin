"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Trash, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  FolderTree, 
  Power, 
  PowerOff, 
  Plus,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FileText
} from "lucide-react";
import CategoryForm from "@/components/forms/category-form";
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
import { 
  Alert,
  AlertDescription,
  AlertTitle 
} from "@/components/ui/alert";
import { 
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePagination } from "@/hooks/usePagination";
import Pagination from "@/components/ui/pagination";
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
  activo?: boolean;
}

// Definimos el tipo Category actualizado
interface Category extends CategoryBase {
  id: number;
  hijos?: Category[];
  padre?: Category;
  activo: boolean;
}

// Tipo para formulario de categoría
interface CategoryFormData extends CategoryBase {
  id?: number;
}

// Tipo para las notificaciones
interface Notification {
  type: "success" | "error" | "info";
  title: string;
  message: string;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
  const [showInactive, setShowInactive] = useState(true);

  // Organizar categorías en estructura jerárquica
  const organizeCategories = (cats: Category[]) => {
    const categoriasPadre = cats.filter(cat => cat.padre_id === null);
    const categoriasHijo = cats.filter(cat => cat.padre_id !== null);

    return categoriasPadre.map(padre => ({
      ...padre,
      hijos: categoriasHijo.filter(hijo => hijo.padre_id === padre.id)
    }));
  };

  // Obtener datos para mostrar según el filtro de activos
  const getDisplayData = () => {
    let filteredCategories = showInactive ? categories : categories.filter(cat => cat.activo);
    return organizeCategories(filteredCategories);
  };

  // Usar el hook de paginación
  const pagination = usePagination({
    data: getDisplayData(),
    initialItemsPerPage: 12,
    initialPage: 1
  });

  // Función para mostrar notificaciones
  const showNotification = (type: "success" | "error" | "info", title: string, message: string) => {
    setNotification({ type, title, message });
    setTimeout(() => setNotification(null), 5000);
    
    if (type === "success") {
      toast.success(`${title}: ${message}`);
    } else if (type === "error") {
      toast.error(`${title}: ${message}`);
    } else {
      toast.info(`${title}: ${message}`);
    }
  };

  // Función para obtener las categorías desde la API
  const fetchCategories = async (updateLoadingState = true) => {
    try {
      if (updateLoadingState) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const response = await fetch('/api/categories');
      if (!response.ok) {
        throw new Error('Error al cargar categorías');
      }
      const data = await response.json();
      setCategories(data);

      if (!updateLoadingState && !refreshing) {
        toast.success("Datos actualizados");
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
      showNotification(
        "error", 
        "Error", 
        "No se pudieron cargar las categorías"
      );
    } finally {
      if (updateLoadingState) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  };

  const handleRefresh = () => {
    fetchCategories(true);
  };

  // Función para alternar el estado activo/inactivo de una categoría
  const toggleCategoryStatus = async (category: Category) => {
    try {
      const newStatus = !category.activo;
      const response = await fetch(`/api/categories/${category.id}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: newStatus }),
      });

      if (response.ok) {
        const data = await response.json();
        await fetchCategories(false);
        showNotification(
          "success", 
          "Estado actualizado", 
          data.message || `La categoría "${category.nombre}" ha sido ${newStatus ? 'activada' : 'desactivada'}`
        );
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al cambiar el estado');
      }
    } catch (error) {
      console.error('Error toggling category status:', error);
      showNotification(
        "error", 
        "Error", 
        error instanceof Error ? error.message : "No se pudo cambiar el estado"
      );
    }
  };

  // Función para sincronizar categorías con la API externa
  const syncCategories = async () => {
    try {
      setIsSyncing(true);
      const response = await fetch('/api/categories/sync');
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error en la sincronización');
      }
      
      const data = await response.json();
      
      await fetchCategories();
      
      showNotification(
        "success", 
        "Sincronización completada", 
        `${data.resumen?.nivel2 || 0} categorías padre y ${data.resumen?.nivel3 || 0} subcategorías sincronizadas`
      );
    } catch (error) {
      console.error('Error syncing categories:', error);
      showNotification(
        "error", 
        "Error de sincronización", 
        error instanceof Error ? error.message : "Error desconocido"
      );
    } finally {
      setIsSyncing(false);
    }
  };

  // Función para alternar expansión de categorías
  const toggleCategoryExpansion = (categoryId: number) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  // Efecto para obtener las categorías al cargar la página
  useEffect(() => {
    fetchCategories();
  }, []);

  // Crear categoría
  const handleCreate = async (data: CategoryFormData) => {
    try {
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, activo: true }),
      });
      if (response.ok) {
        const newCategory = await response.json();
        await fetchCategories(false);
        
        // Si es una subcategoría, expandir el padre automáticamente
        if (data.padre_id) {
          setExpandedCategories(prev => {
            const newSet = new Set(prev);
            newSet.add(data.padre_id!);
            return newSet;
          });
        }
        
        showNotification(
          "success", 
          "Categoría creada", 
          "La categoría ha sido creada correctamente"
        );
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al crear la categoría');
      }
    } catch (error) {
      console.error('Error creating category:', error);
      showNotification(
        "error", 
        "Error", 
        error instanceof Error ? error.message : "No se pudo crear la categoría"
      );
    }
  };

  // Actualizar categoría
  const handleUpdate = async (id: number, data: CategoryFormData) => {
    try {
      const response = await fetch(`/api/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (response.ok) {
        fetchCategories();
        showNotification(
          "success", 
          "Categoría actualizada", 
          "La categoría ha sido actualizada correctamente"
        );
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al actualizar la categoría');
      }
    } catch (error) {
      console.error('Error updating category:', error);
      showNotification(
        "error", 
        "Error", 
        error instanceof Error ? error.message : "No se pudo actualizar la categoría"
      );
    }
  };

  // Eliminar categoría
  const handleDelete = async (id: number) => {
    try {
      console.log('Attempting to delete category with ID:', id);
      
      const response = await fetch(`/api/categories/${id}`, {
        method: 'DELETE',
      });
      
      console.log('Delete response status:', response.status);
      
      if (response.ok) {
        await fetchCategories(false);
        setDeleteDialogOpen(false);
        setCategoryToDelete(null);
        showNotification(
          "success", 
          "Categoría eliminada", 
          "La categoría ha sido eliminada correctamente"
        );
      } else {
        let errorMessage = 'Error al eliminar la categoría';
        
        try {
          const errorData = await response.json();
          console.log('Error response data:', errorData);
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch (parseError) {
          console.log('Could not parse error response as JSON');
          // Si no se puede parsear como JSON, intentar obtener el texto
          try {
            const errorText = await response.text();
            console.log('Error response text:', errorText);
            errorMessage = errorText || `Error ${response.status}: ${response.statusText}`;
          } catch (textError) {
            errorMessage = `Error ${response.status}: ${response.statusText}`;
          }
        }
        
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('Error deleting category:', error);
      
      // Cerrar el diálogo incluso si hay error
      setDeleteDialogOpen(false);
      setCategoryToDelete(null);
      
      let errorMessage = "No se pudo eliminar la categoría";
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      showNotification(
        "error", 
        "Error al eliminar", 
        errorMessage
      );
    }
  };

  // Función para preparar el diálogo de eliminación
  const handleDeleteClick = (category: Category) => {
    setCategoryToDelete(category);
    setDeleteDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-lg">Cargando categorías...</div>
      </div>
    );
  }

  const activeCategories = categories.filter(cat => cat.activo).length;
  const inactiveCategories = categories.filter(cat => !cat.activo).length;
  const parentCategories = categories.filter(cat => cat.padre_id === null).length;
  const childCategories = categories.filter(cat => cat.padre_id !== null).length;

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6 lg:p-8">
      {notification && (
        <Alert 
          variant={notification.type === "error" ? "destructive" : "default"}
          className={notification.type === "success" ? "border-green-500 text-green-700" : ""}
        >
          <AlertTitle>{notification.title}</AlertTitle>
          <AlertDescription>{notification.message}</AlertDescription>
        </Alert>
      )}

      {/* Header con título y estadísticas */}
      <div className="flex flex-col space-y-4 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
        <div className="flex flex-col space-y-3 lg:flex-row lg:items-center lg:space-y-0 lg:space-x-4">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Gestión de Categorías</h2>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="bg-blue-50 text-xs sm:text-sm">
              {categories.length} total
            </Badge>
            <Badge variant="default" className="bg-green-100 text-green-800 text-xs sm:text-sm">
              {activeCategories} activas
            </Badge>
            <Badge variant="secondary" className="bg-red-100 text-red-800 text-xs sm:text-sm">
              {inactiveCategories} inactivas
            </Badge>
            <Badge variant="outline" className="bg-purple-50 text-xs sm:text-sm">
              {parentCategories} principales
            </Badge>
            <Badge variant="outline" className="bg-orange-50 text-xs sm:text-sm">
              {childCategories} subcategorías
            </Badge>
          </div>
        </div>
        
        {/* Botones de acción - responsive */}
        <div className="flex flex-wrap gap-2">
          <Button 
            variant={showInactive ? "default" : "outline"} 
            onClick={() => setShowInactive(!showInactive)}
            size="sm"
            className="flex-1 sm:flex-none"
          >
            {showInactive ? <EyeOff className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> : <Eye className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />}
            <span className="hidden sm:inline">{showInactive ? "Ocultar Inactivas" : "Mostrar Inactivas"}</span>
            <span className="sm:hidden">{showInactive ? "Ocultar" : "Mostrar"}</span>
          </Button>
          
          <Button 
            variant="outline" 
            onClick={handleRefresh}
            disabled={refreshing}
            size="sm"
            className="flex-1 sm:flex-none"
          >
            <RefreshCw className={`mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{refreshing ? 'Actualizando...' : 'Actualizar'}</span>
            <span className="sm:hidden">Actualizar</span>
          </Button>
          
          <Button 
            onClick={syncCategories} 
            disabled={isSyncing}
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-none"
          >
            <RefreshCw className={`h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isSyncing ? 'Sincronizando...' : 'Sincronizar API'}</span>
            <span className="sm:hidden">Sync</span>
          </Button>
          
          <CategoryForm onSubmit={handleCreate} />
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="text-center py-12 sm:py-20 text-gray-500">
          <FolderTree className="mx-auto h-12 w-12 sm:h-16 sm:w-16 mb-4 text-gray-300" />
          <p className="text-lg sm:text-xl mb-2">No hay categorías disponibles</p>
          <p className="text-sm">Sincroniza con la API externa o crea una nueva categoría</p>
        </div>
      ) : (
        <>
          {/* Grid de tarjetas responsive */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {pagination.currentData.map((category) => (
              <Card key={category.id} className={`${!category.activo ? 'opacity-60 border-gray-300' : 'border-blue-200'} transition-all duration-200 hover:shadow-lg`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                      {category.hijos && category.hijos.length > 0 ? (
                        <FolderOpen className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 flex-shrink-0" />
                      ) : (
                        <Folder className="h-4 w-4 sm:h-5 sm:w-5 text-gray-600 flex-shrink-0" />
                      )}
                      <CardTitle className={`text-sm sm:text-lg leading-tight ${!category.activo ? 'line-through text-gray-500' : ''}`}>
                        {category.nombre}
                      </CardTitle>
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <Badge variant={category.activo ? "default" : "secondary"} className="text-xs">
                        {category.activo ? "Activa" : "Inactiva"}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Nivel 2
                      </Badge>
                    </div>
                  </div>
                  <CardDescription className="text-xs sm:text-sm line-clamp-2">
                    {category.descripcion || 'Sin descripción'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* Información básica */}
                    <div className="text-xs text-gray-500 space-y-1">
                      <p className="truncate"><strong>Slug:</strong> {category.slug}</p>
                      {category.id_externo && <p className="truncate"><strong>ID Externo:</strong> {category.id_externo}</p>}
                    </div>

                    {/* Subcategorías */}
                    {category.hijos && category.hijos.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs sm:text-sm font-medium text-gray-700">
                            Subcategorías ({category.hijos.filter(h => showInactive || h.activo).length})
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleCategoryExpansion(category.id)}
                            className="h-6 w-6 p-0"
                          >
                            {expandedCategories.has(category.id) ? 
                              <ChevronDown className="h-3 w-3" /> : 
                              <ChevronRight className="h-3 w-3" />
                            }
                          </Button>
                        </div>
                        
                        {expandedCategories.has(category.id) && (
                          <div className="space-y-1 ml-2 border-l-2 border-gray-200 pl-3 max-h-48 overflow-y-auto">
                            {category.hijos
                              .filter(hijo => showInactive || hijo.activo)
                              .map((hijo) => (
                              <div key={hijo.id} className="flex items-center justify-between py-1 gap-2">
                                <div className="flex items-center space-x-2 min-w-0 flex-1">
                                  <FileText className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                  <span className={`text-xs truncate ${!hijo.activo ? 'line-through text-gray-400' : ''}`}>
                                    {hijo.nombre}
                                  </span>
                                  {!hijo.activo && <Badge variant="destructive" className="text-xs py-0 px-1">Inactiva</Badge>}
                                </div>
                                <div className="flex space-x-1 flex-shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => toggleCategoryStatus(hijo)}
                                    title={hijo.activo ? "Desactivar" : "Activar"}
                                  >
                                    {hijo.activo ? 
                                      <Power className="h-3 w-3 text-green-600" /> : 
                                      <PowerOff className="h-3 w-3 text-red-600" />
                                    }
                                  </Button>
                                  <CategoryForm
                                    mode="edit"
                                    categoria={hijo}
                                    onSubmit={(data) => handleUpdate(hijo.id, data)}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => handleDeleteClick(hijo)}
                                    title="Eliminar subcategoría"
                                  >
                                    <Trash className="h-3 w-3 text-red-600" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Acciones */}
                    <div className="flex justify-between items-center pt-2 border-t">
                      <div className="flex space-x-1">
                        <CategoryForm
                          mode="create-subcategory"
                          parentId={category.id}
                          parentName={category.nombre}
                          onSubmit={handleCreate}
                        />
                      </div>
                      
                      <div className="flex space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleCategoryStatus(category)}
                          title={category.activo ? "Desactivar" : "Activar"}
                          className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                        >
                          {category.activo ? 
                            <Power className="h-3 w-3 text-green-600" /> : 
                            <PowerOff className="h-3 w-3 text-red-600" />
                          }
                        </Button>
                        <CategoryForm
                          mode="edit"
                          categoria={category}
                          onSubmit={(data) => handleUpdate(category.id, data)}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(category)}
                          className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                        >
                          <Trash className="h-3 w-3 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
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

      {/* Confirmación para eliminar la categoría */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="mx-4 max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Esto eliminará permanentemente la categoría
              <strong> "{categoryToDelete?.nombre}"</strong>
              {categoryToDelete?.hijos && categoryToDelete.hijos.length > 0 && 
                ` y sus ${categoryToDelete.hijos.length} subcategorías`}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => {
              setDeleteDialogOpen(false);
              setCategoryToDelete(null);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => categoryToDelete && handleDelete(categoryToDelete.id)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}