"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

interface SearchBillPaginationProps {
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
  onPageChange: (page: number) => void;
  onLoadMore?: () => void;
  loading: boolean;
  totalItems: number;
}

export default function SearchBillPagination({ 
  currentPage, 
  totalPages, 
  hasMore,
  onPageChange, 
  // onLoadMore - unused but kept for interface compatibility
  loading,
  totalItems 
}: SearchBillPaginationProps) {
  // If no data, don't show pagination
  if (totalItems === 0) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border border-t-0 border-slate-200 rounded-b-lg">
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <span>Mostrando página</span>
        <span className="font-semibold">{currentPage}</span>
        <span>de</span>
        <span className="font-semibold">{totalPages}</span>
        <span className="text-slate-400">({totalItems} registros)</span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1 || loading}
          className="h-8"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="ml-1">Anterior</span>
        </Button>

        {/* Page indicator */}
        <div className="flex items-center gap-1 px-3 py-1 bg-white border border-slate-200 rounded">
          <span className="text-sm font-medium text-slate-700">{currentPage}</span>
          <span className="text-slate-400">/</span>
          <span className="text-sm font-medium text-slate-700">{totalPages}</span>
        </div>

        {hasMore ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={loading}
            className="h-8"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
              </>
            ) : (
              <>
                <span className="mr-1">Siguiente</span>
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled className="h-8 opacity-50 cursor-not-allowed">
            <span className="mr-1">Siguiente</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}