"use client";

import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import SearchBillRow from "./SearchBillRow";
import type BillState from "@/models/BillState";

interface SearchBillListProps {
  sales: BillState[];
  onDeleted?: () => void;
}

export default function SearchBillList({ sales, onDeleted }: SearchBillListProps) {
  if (sales.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500 border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
        <p className="text-lg font-medium">No se encontraron ventas</p>
        <p className="text-sm">Intenta con otros filtros de búsqueda</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
      <Table>
        <TableHeader className="bg-slate-50">
          <TableRow className="hover:bg-slate-50">
            <TableHead className="font-semibold text-slate-700 py-3 px-6">Fecha</TableHead>
            <TableHead className="font-semibold text-slate-700 py-3 px-6">Tipo</TableHead>
            <TableHead className="font-semibold text-slate-700 py-3 px-6">Medio Pago</TableHead>
            <TableHead className="font-semibold text-slate-700 py-3 px-6">Vendedor</TableHead>
            <TableHead className="text-right font-semibold text-slate-700 py-3 px-6">Total</TableHead>
            <TableHead className="text-right font-semibold text-slate-700 py-3 px-6">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sales.map((sale) => (
            <SearchBillRow key={sale.id} sale={sale} onDeleted={onDeleted} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}