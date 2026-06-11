"use client";

import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface ActiveFiltersSummaryProps {
  seller: string;
  startDate: string;
  endDate: string;
  saleTypes: string[];
  paymentMethods: string[];
  paymentMethodLabels?: Record<string, string>;
  onReset: () => void;
  onRemoveSeller?: () => void;
  onRemoveStartDate?: () => void;
  onRemoveEndDate?: () => void;
  onRemoveSaleType?: (type: string) => void;
  onRemovePaymentMethod?: (method: string) => void;
}

export default function ActiveFiltersSummary({
  seller,
  startDate,
  endDate,
  saleTypes,
  paymentMethods,
  paymentMethodLabels = {},
  onReset,
  onRemoveSeller,
  onRemoveStartDate,
  onRemoveEndDate,
  onRemoveSaleType,
  onRemovePaymentMethod,
}: ActiveFiltersSummaryProps) {
  const hasActiveFilters = seller || startDate || endDate || saleTypes.length > 0 || paymentMethods.length > 0;

  if (!hasActiveFilters) return null;

  return (
    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
      <span className="text-xs text-slate-500">Filtros activos:</span>
      <div className="flex flex-wrap gap-1">
        {seller && (
          <Badge variant="secondary" className="text-xs pr-1 flex items-center gap-1">
            {seller.split("@")[0]}
            {onRemoveSeller && (
              <button
                onClick={onRemoveSeller}
                className="ml-1 hover:bg-slate-200 rounded p-0.5 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        )}
        {startDate && (
          <Badge variant="secondary" className="text-xs pr-1 flex items-center gap-1">
            Desde: {startDate}
            {onRemoveStartDate && (
              <button
                onClick={onRemoveStartDate}
                className="ml-1 hover:bg-slate-200 rounded p-0.5 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        )}
        {endDate && (
          <Badge variant="secondary" className="text-xs pr-1 flex items-center gap-1">
            Hasta: {endDate}
            {onRemoveEndDate && (
              <button
                onClick={onRemoveEndDate}
                className="ml-1 hover:bg-slate-200 rounded p-0.5 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        )}
        {saleTypes.map((t) => (
          <Badge key={t} variant="outline" className="text-xs pr-1 bg-blue-50 border-blue-200 text-blue-700 flex items-center gap-1">
            {t}
            {onRemoveSaleType && (
              <button
                onClick={() => onRemoveSaleType(t)}
                className="ml-1 hover:bg-blue-100 rounded p-0.5 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
        {paymentMethods.map((m) => (
          <Badge key={m} variant="outline" className="text-xs pr-1 bg-emerald-50 border-emerald-200 text-emerald-700 flex items-center gap-1">
            {paymentMethodLabels[m] || m}
            {onRemovePaymentMethod && (
              <button
                onClick={() => onRemovePaymentMethod(m)}
                className="ml-1 hover:bg-emerald-100 rounded p-0.5 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
      </div>
      <button
        onClick={onReset}
        className="text-sm text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-md transition-colors flex items-center gap-1 font-medium ml-auto"
      >
        <X className="h-3 w-3" />
        Limpiar
      </button>
    </div>
  );
}