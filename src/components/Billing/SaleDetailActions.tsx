"use client";

import { useState } from "react";
import { Printer, FileText, CheckCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import PrintOptionsPopover from "./PrintOptionsPopover";
import InvoiceModal from "./InvoiceModal";
import type BillState from "@/models/BillState";
import { Session } from "next-auth";


interface SaleDetailActionsProps {
  sale: BillState;
  session: Session | null;
}

export default function SaleDetailActions({ sale, session }: SaleDetailActionsProps) {
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  const isInvoiced = Boolean(sale.CAE?.CAE);

  return (
    <>
    <InvoiceModal
      open={invoiceOpen}
      onOpenChange={setInvoiceOpen}
      sale={sale}
    />

    <section className="bg-card border rounded-xl p-5 shadow-sm h-fit space-y-4">
      <h3 className="text-sm font-semibold text-card-foreground flex items-center gap-2">
        <Printer className="h-4 w-4 text-muted-foreground" />
        Acciones
      </h3>

      {/* Print */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Imprimir comprobante</span>
        <PrintOptionsPopover sale={sale} session={session} />
      </div>

      {/* Invoice / CAE */}
      {isInvoiced ? (
        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-800 space-y-2">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-300 font-medium text-sm">
            <CheckCircle className="h-4 w-4" />
            Facturado
          </div>
          <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
            {sale.CAE?.nroComprobante && (
              <div className="flex justify-between">
                <span>Comprobante N°</span>
                <span className="font-mono font-medium text-slate-900 dark:text-white">
                  {sale.CAE.nroComprobante.toString().padStart(8, "0")}
                </span>
              </div>
            )}
            {sale.CAE?.CAE && (
              <div className="flex justify-between">
                <span>CAE</span>
                <span className="font-mono font-medium text-slate-900 dark:text-white text-[10px]">
                  {sale.CAE.CAE}
                </span>
              </div>
            )}
            {sale.CAE?.vencimiento && (
              <div className="flex justify-between">
                <span>Vencimiento CAE</span>
                <span className="font-mono font-medium text-slate-900 dark:text-white">
                  {sale.CAE.vencimiento}
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800">
            <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="text-xs text-amber-700 dark:text-amber-300">
              Esta venta aún no fue facturada
            </span>
          </div>
          <Button
            onClick={() => setInvoiceOpen(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            <FileText className="h-4 w-4" />
            Facturar
          </Button>
        </div>
      )}
    </section>
    </>
  );
}
