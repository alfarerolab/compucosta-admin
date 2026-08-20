import React from 'react';
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (itemsPerPage: number) => void;
  onNextPage: () => void;
  onPreviousPage: () => void;
  canGoNext: boolean;
  canGoPrevious: boolean;
  getPageNumbers: () => number[];
  getPaginationInfo: () => {
    startItem: number;
    endItem: number;
    totalItems: number;
  };
  itemsPerPageOptions?: number[];
  showItemsPerPageSelector?: boolean;
  showPaginationInfo?: boolean;
  className?: string;
}

export default function Pagination({
  currentPage,
  totalPages,
  itemsPerPage,
  totalItems,
  onPageChange,
  onItemsPerPageChange,
  onNextPage,
  onPreviousPage,
  canGoNext,
  canGoPrevious,
  getPageNumbers,
  getPaginationInfo,
  itemsPerPageOptions = [5, 10, 25, 50, 100],
  showItemsPerPageSelector = true,
  showPaginationInfo = true,
  className = ""
}: PaginationProps) {
  const pageNumbers = getPageNumbers();
  const paginationInfo = getPaginationInfo();

  if (totalItems === 0) {
    return null;
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Selector de elementos por página e información */}
      <div className="flex justify-between items-center">
        {showItemsPerPageSelector && (
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Mostrar</span>
            <select 
              className="border rounded-md p-1 text-sm"
              value={itemsPerPage}
              onChange={(e) => onItemsPerPageChange(parseInt(e.target.value))}
            >
              {itemsPerPageOptions.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <span className="text-sm text-gray-600">elementos por página</span>
          </div>
        )}
        
        {showPaginationInfo && (
          <div className="text-sm text-gray-600">
            Mostrando {paginationInfo.startItem} a {paginationInfo.endItem} de {paginationInfo.totalItems} elementos
          </div>
        )}
      </div>

      {/* Controles de paginación */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center space-x-2">
          {/* Botón Anterior */}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onPreviousPage} 
            disabled={!canGoPrevious}
            className="flex items-center gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>
          
          {/* Números de página */}
          <div className="flex gap-1">
            {pageNumbers.map((number, index, array) => (
              <React.Fragment key={number}>
                {/* Mostrar puntos suspensivos si hay salto */}
                {index > 0 && number - array[index - 1] > 1 && (
                  <span className="px-2 py-1 text-sm text-gray-500">...</span>
                )}
                
                <Button
                  variant={currentPage === number ? "default" : "outline"}
                  size="sm"
                  onClick={() => onPageChange(number)}
                  className="w-8 h-8 p-0"
                >
                  {number}
                </Button>
              </React.Fragment>
            ))}
          </div>
          
          {/* Botón Siguiente */}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onNextPage} 
            disabled={!canGoNext}
            className="flex items-center gap-1"
          >
            Siguiente
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}