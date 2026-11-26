"use client";
import React, { useState } from "react";
import BillState from "@/models/BillState";
import InvoiceModal from "./InvoiceModal";
import PrintOptionsPopover from "./PrintOptionsPopover";
import { deleteOrderAction } from "@/actions/sales/update";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Session } from "next-auth";
import { formatLocalDate } from "@/utils/date";
import { toast } from "sonner";
import { Ban, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import CreditNoteButton from "./CreditNoteButton";
import { createCreditNoteAction } from "@/actions/sales/credit-note";
import { formatInvoiceNumberFull } from "@/lib/utils/bill-type";
import { hasValidSalesPresentationCae } from "@/services/sales-document-classification";

interface props {
  sale: BillState;
  session: Session | null;
  qzTrayEnabled?: boolean;
}

const SaleAccordion = ({ sale, session, qzTrayEnabled }: props) => {
  const router = useRouter();
  const [openDelete, setOpenDelete] = useState(false);
  const [deleteSale, setDeleteSale] = useState<BillState>();
  const [openBilling, setOpenBilling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  const canIssueCreditNote = session?.user?.role === "USER"
    || session?.user?.role === "ADMIN"
    || session?.user?.role === "SUPER_ADMIN";
  const isInvoiced = hasValidSalesPresentationCae(sale.CAE);
  const openDetail = () => router.push(`/sales/${sale.id}`);
  const ncSale = sale.fiscalContext ?? sale.creditNoteRecovery;
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
        : !ncSale
          ? "La venta no tiene el desglose fiscal necesario para una Nota de Crédito."
          : !ncEligible
            ? "La venta no es elegible para una Nota de Crédito."
            : null;

  const handleDelete = async () => {
    if (!deleteSale) return;
    setDeleting(true);
    const result = await deleteOrderAction(deleteSale.id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Venta eliminada");
    }
    setDeleting(false);
    setOpenDelete(false);
  };

  return (
    <>
      <div
        onClick={openDetail}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openDetail();
          }
        }}
        role="link"
        tabIndex={0}
        className={cn(
          "grid grid-cols-[2fr_2fr_2fr_3fr_2fr_90px] items-center gap-4",
          "px-5 py-3.5 w-[700px] sm:w-full min-w-max cursor-pointer",
        "transition-colors duration-100",
          "hover:bg-gray-50 dark:hover:bg-gray-800/30",
          "text-sm text-gray-700 dark:text-gray-300",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        )}
      >
        {/* Date */}
        <span className="font-medium text-gray-900 dark:text-gray-100">
          {sale.date ? formatLocalDate(sale.date) : ""}
        </span>

        {/* Invoice / CAE */}
        <div>
          {hasValidSalesPresentationCae(sale.CAE) ? (
            <span className="text-gray-600 dark:text-gray-400 font-mono text-xs">
              {formatInvoiceNumberFull(sale.CAE?.nroComprobante, sale.ptoVenta ?? sale.CAE?.ptoVenta)}
            </span>
          ) : (
            <button
              onClick={(event) => {
                event.stopPropagation();
                setOpenBilling(true);
              }}
              className="px-3 py-1.5 rounded-md bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-800 dark:hover:text-blue-100 transition-colors text-xs font-semibold whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Facturar
            </button>
          )}
        </div>

        {/* Payment Method */}
        <span className="text-gray-600 dark:text-gray-400 capitalize">
          {sale.paidMethod}
        </span>

        {/* Seller */}
        <span className="truncate text-gray-600 dark:text-gray-400">
          {sale.seller.split("@")[0]}
        </span>

        {/* Total Price */}
        <span className="font-semibold text-gray-900 dark:text-gray-100 text-right pr-2">
          $
          {sale.totalWithDiscount
            ? sale.totalWithDiscount.toLocaleString("es-AR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            : sale.total}
        </span>

        {/* Actions */}
        <div
          className="flex items-center justify-center gap-0.5"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <PrintOptionsPopover sale={sale} session={session} qzTrayEnabled={qzTrayEnabled} />

          {isInvoiced ? (
            ncBlockedReason ? (
              <button
                type="button"
                disabled
                title={ncBlockedReason}
                aria-label={ncBlockedReason}
                className="cursor-not-allowed p-1.5 rounded-md text-gray-300 dark:text-gray-600"
              >
                <Ban className="h-4 w-4" />
              </button>
            ) : (
              <CreditNoteButton
                variant="icon"
                sale={ncSale!}
                createCreditNote={createCreditNoteAction}
              />
            )
          ) : (
            <button
              disabled={!isAdmin}
              onClick={(event) => {
                event.stopPropagation();
                setDeleteSale(sale);
                setOpenDelete(true);
              }}
              className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Eliminar venta"
              aria-label={`Eliminar venta ${sale.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <AlertDialog open={openDelete} onOpenChange={setOpenDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar venta</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar esta venta? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <InvoiceModal
        open={openBilling}
        onOpenChange={setOpenBilling}
        sale={sale}
      />
    </>
  );
};

export default SaleAccordion;
