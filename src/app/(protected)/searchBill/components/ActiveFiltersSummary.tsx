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
}

export default function ActiveFiltersSummary({
  seller,
  startDate,
  endDate,
  saleTypes,
  paymentMethods,
  paymentMethodLabels = {},
  onReset,
}: ActiveFiltersSummaryProps) {
  const hasActiveFilters = seller || startDate || endDate || saleTypes.length > 0 || paymentMethods.length > 0;

  if (!hasActiveFilters) return null;

  return (
    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
      <span className="text-xs text-slate-500">Filtros activos:</span>
      <div className="flex flex-wrap gap-1">
        {seller && <Badge variant="secondary" className="text-xs">{seller.split("@")[0]}</Badge>}
        {startDate && <Badge variant="secondary" className="text-xs">Desde: {startDate}</Badge>}
        {endDate && <Badge variant="secondary" className="text-xs">Hasta: {endDate}</Badge>}
        {saleTypes.map((t) => (
          <Badge key={t} variant="outline" className="text-xs bg-blue-50 border-blue-200 text-blue-700">{t}</Badge>
        ))}
        {paymentMethods.map((m) => (
          <Badge key={m} variant="outline" className="text-xs bg-emerald-50 border-emerald-200 text-emerald-700">
            {paymentMethodLabels[m] || m}
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