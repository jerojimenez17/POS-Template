"use client";
import React, { useState } from "react";
import BillState from "@/models/BillState";
import InvoiceModal from "./InvoiceModal";
import { useRouter } from "next/navigation";
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
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface props {
  sale: BillState;
  session: Session | null;
}

const SaleAccordion = ({ sale, session }: props) => {
  const router = useRouter();
  const [openDelete, setOpenDelete] = useState(false);
  const [deleteSale, setDeleteSale] = useState<BillState>();
  const [openBilling, setOpenBilling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL;

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
        className={cn(
          "grid grid-cols-[2fr_2fr_2fr_3fr_2fr_90px] items-center gap-4",
          "px-5 py-3.5 w-[700px] sm:w-full min-w-max",
          "cursor-pointer transition-colors duration-100",
          "hover:bg-gray-50 dark:hover:bg-gray-800/30",
          "text-sm text-gray-700 dark:text-gray-300"
        )}
        onClick={() => router.push(`/sales/${sale.id}`)}
      >
        {/* Date */}
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {sale.date ? formatLocalDate(sale.date) : ""}
        </div>

        {/* Invoice / CAE */}
        <div onClick={(e) => e.stopPropagation()}>
          {sale.CAE?.CAE && sale.CAE.CAE !== "" ? (
            <span className="text-gray-600 dark:text-gray-400 font-mono text-xs">
              {sale.CAE.CAE}
            </span>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenBilling(true);
              }}
              className="px-3 py-1.5 rounded-md bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-colors text-xs font-semibold whitespace-nowrap"
            >
              Facturar
            </button>
          )}
        </div>

        {/* Payment Method */}
        <div className="text-gray-600 dark:text-gray-400 capitalize">
          {sale.paidMethod}
        </div>

        {/* Seller */}
        <div className="truncate text-gray-600 dark:text-gray-400">
          {sale.seller.split("@")[0]}
        </div>

        {/* Total Price */}
        <div className="font-semibold text-gray-900 dark:text-gray-100 text-right pr-2">
          $
          {sale.totalWithDiscount
            ? sale.totalWithDiscount.toLocaleString("es-AR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            : sale.total}
        </div>

        {/* Actions */}
        <div
          className="flex items-center justify-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <PrintOptionsPopover sale={sale} session={session} />

          <button
            disabled={!isAdmin}
            onClick={(e) => {
              e.stopPropagation();
              setDeleteSale(sale);
              setOpenDelete(true);
            }}
            className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Eliminar venta"
          >
            <Trash2 className="h-4 w-4" />
          </button>
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
