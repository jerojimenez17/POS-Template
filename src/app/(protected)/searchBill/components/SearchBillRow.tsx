"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { FileText, FilePlus } from "lucide-react";
import type BillState from "@/models/BillState";
import BillingModal from "@/components/Billing/BillingModal";
import PrintOptionsPopover from "@/components/Billing/PrintOptionsPopover";
import DeleteConfirmDialog from "./DeleteConfirmDialog";

interface SearchBillRowProps {
  sale: BillState;
  onDeleted?: () => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));

const getPaymentDisplay = (sale: BillState) => {
  const methods = [];
  if (sale.paidMethod) methods.push(sale.paidMethod);
  if (sale.twoMethods && sale.secondPaidMethod) methods.push(sale.secondPaidMethod);
  return methods.join(" + ");
};

export default function SearchBillRow({ sale, onDeleted }: SearchBillRowProps) {
  const router = useRouter();
  const [openBilling, setOpenBilling] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);

  const isFactura = sale.CAE?.CAE && sale.CAE.CAE !== "";
  const sellerName = sale.seller.split("@")[0];
  const caeNumber = sale.CAE?.CAE || "";

  const handleRowClick = () => {
    router.push(`/sales/${sale.id}`);
  };

  return (
    <>
      <TableRow 
        className="hover:bg-blue-50/80 transition-colors cursor-pointer"
        onClick={handleRowClick}
      >
        <TableCell className="font-medium py-4 px-6">
          <span className="text-slate-900">{formatDate(sale.date)}</span>
        </TableCell>

        <TableCell className="py-4 px-6">
          <div className="flex items-center gap-2">
            {isFactura ? (
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200">
                Factura
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                Remito
              </Badge>
            )}
            {isFactura && caeNumber && (
              <div className="relative group">
                <FileText className="h-4 w-4 text-blue-500 cursor-pointer" />
                <div className="absolute z-50 hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg whitespace-nowrap">
                  CAE: {caeNumber}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                </div>
              </div>
            )}
          </div>
        </TableCell>

        <TableCell className="py-4 px-6">
          <div className="flex flex-col">
            <span className="font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded inline-block w-fit">
              {getPaymentDisplay(sale)}
            </span>
            {sale.twoMethods && (
              <span className="text-xs text-slate-500 mt-1">
                {sale.paidMethod}: {formatCurrency((sale.totalWithDiscount || sale.total) - (sale.totalSecondMethod || 0))}
                <span className="mx-1">+</span>
                {sale.secondPaidMethod}: {formatCurrency(sale.totalSecondMethod || 0)}
              </span>
            )}
          </div>
        </TableCell>

        <TableCell className="py-4 px-6">
          <span className="text-slate-600">{sellerName}</span>
        </TableCell>

        <TableCell className="text-right py-4 px-6">
          <span className="font-bold text-slate-900 text-lg">
            {formatCurrency(sale.totalWithDiscount || sale.total)}
          </span>
        </TableCell>

        <TableCell className="py-4 px-6">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {!isFactura && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-blue-50"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenBilling(true);
                }}
              >
                <FilePlus className="h-4 w-4 text-blue-600" />
              </Button>
            )}
            <PrintOptionsPopover sale={sale} session={null} />
            <DeleteConfirmDialog
              saleId={sale.id}
              open={openDelete}
              onOpenChange={setOpenDelete}
              onDeleted={onDeleted}
            />
          </div>
        </TableCell>
      </TableRow>

      <BillingModal
        open={openBilling}
        onOpenChange={setOpenBilling}
        sale={sale}
        onSuccess={() => setOpenBilling(false)}
      />
    </>
  );
}