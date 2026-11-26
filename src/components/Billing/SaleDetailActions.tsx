"use client";

import { useState } from "react";
import { Printer, FileText, CheckCircle, ShieldAlert, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import PrintOptionsPopover from "./PrintOptionsPopover";
import InvoiceModal from "./InvoiceModal";
import CreditNoteButton, { type CreditNoteButtonProps } from "./CreditNoteButton";
import type BillState from "@/models/BillState";
import { Session } from "next-auth";
import { formatInvoiceNumberFull } from "@/lib/utils/bill-type";


interface SaleDetailActionsProps {
  sale: BillState;
  session: Session | null;
  createCreditNote?: CreditNoteButtonProps["createCreditNote"];
}

export default function SaleDetailActions({ sale, session, createCreditNote }: SaleDetailActionsProps) {
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  const isInvoiced = Boolean(sale.CAE?.CAE);
  const canIssueCreditNote = session?.user?.role === "USER"
    || session?.user?.role === "ADMIN"
    || session?.user?.role === "SUPER_ADMIN";
  const creditNoteSale = sale.fiscalContext ?? sale.creditNoteRecovery ?? null;
  const ncStatus = sale.creditNote?.status ?? sale.fiscalContext?.creditNote?.status ?? sale.creditNoteRecovery?.creditNoteStatus;
  const ncEligible = Boolean(
    sale.fiscalContext?.eligibleForFullCreditNote === true
    || (Array.isArray(sale.creditNoteRecovery?.missingFields) && sale.creditNoteRecovery.missingFields.length > 0),
  );
  const ncBlockedReason = !canIssueCreditNote
    ? "Tu usuario no tiene permisos para emitir Notas de Crédito."
    : ncStatus === "AUTHORIZED"
      ? "La venta ya tiene una Nota de Crédito autorizada."
      : ncStatus === "PENDING"
        ? "Hay una Nota de Crédito pendiente de finalizar."
        : !creditNoteSale
          ? "La venta no tiene el desglose fiscal necesario para una Nota de Crédito."
          : !ncEligible
            ? "La venta no es elegible para una Nota de Crédito."
            : null;
  const showCreditNote = isInvoiced || Boolean(creditNoteSale);

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
        <span className="text-sm text-muted-foreground">Imprimir comprobante:</span>
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
                  {formatInvoiceNumberFull(sale.CAE.nroComprobante, sale.ptoVenta ?? sale.CAE.ptoVenta)}
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

      {showCreditNote && ncBlockedReason && (
        <div className="border-t border-border pt-4">
          <Button type="button" variant="outline" disabled className="w-full gap-2" title={ncBlockedReason} aria-label={ncBlockedReason}>
            <Ban className="h-4 w-4" />
            Nota de Crédito
          </Button>
        </div>
      )}

      {showCreditNote && !ncBlockedReason && canIssueCreditNote && creditNoteSale && createCreditNote && (
        <div id="nota-credito" className="scroll-mt-24 border-t border-border pt-4">
          <CreditNoteButton variant="button" sale={creditNoteSale} createCreditNote={createCreditNote} />
        </div>
      )}
    </section>
    </>
  );
}
