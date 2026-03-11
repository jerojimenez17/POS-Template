import BillState from "@/models/BillState";
import BillingModal from "./BillingModal";
import React, { useState } from "react";
import PrintButton from "./PrintButton";
import { db } from "@/firebase/config";
import { deleteSaleAction } from "@/actions/sales";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import DeleteButton from "../DeleteButton";
import Modal from "../Modal";

// Assuming User and other types are needed or using any for now if not sure about the exact firebase User type
interface props {
  sale: BillState;
  onClick: () => void;
  user: any;
}
const SaleAccordion = ({ sale, onClick, user }: props) => {
  const [openDelete, setOpenDelete] = useState(false);
  const [deleteSale, setDeleteSale] = useState<BillState>();
  const [openBilling, setOpenBilling] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    if (!deleteSale) return;
    const res = await deleteSaleAction(deleteSale.id);
    if (res.success) {
      toast.success(res.success);
      setOpenDelete(false);
    } else {
      toast.error(res.error || "Error al eliminar la venta");
    }
  };

  return (
    <div className="rounded p-4 bg-white shadow-sm hover:shadow-md transition-shadow m-1 border border-gray-100 dark:border-gray-800 text-xs sm:text-sm md:text-base w-[700px] sm:w-full min-w-max">
      <div className="grid grid-cols-[2fr_2fr_2fr_3fr_2fr_80px_40px] items-center gap-4 text-gray-700 dark:text-gray-300">
        
        {/* Date */}
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {sale.date?.toLocaleDateString()}
        </div>

        {/* Invoice / CAE */}
        <div>
          {sale.CAE?.CAE && sale.CAE.CAE !== "" ? (
            <span className="text-gray-600 dark:text-gray-400 font-mono text-xs">{sale.CAE.CAE}</span>
          ) : (
            <button
              onClick={() => setOpenBilling(true)}
              className="px-3 py-1.5 rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-colors text-xs font-semibold whitespace-nowrap"
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

        {/* Action: Print */}
        <div className="flex justify-center items-center gap-1">
          <div 
            className="flex justify-center items-center cursor-pointer p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors" 
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            title="Imprimir"
          >
            <PrintButton onClick={onClick} />
          </div>

          <div 
            className="flex justify-center items-center cursor-pointer p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors text-blue-600" 
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/searchBill/${sale.id}`);
            }}
            title="Ver detalle / Editar"
          >
            <Pencil size={18} />
          </div>
        </div>

        {/* Action: Delete */}
        <div 
          className="flex justify-center items-center p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors" 
        >
          <DeleteButton
            disable={user?.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL}
            onClick={(e) => {
              e.stopPropagation();
              setDeleteSale(sale);
              setOpenDelete(true);
            }}
          />
        </div>
      </div>
      <Modal
        message="Desea eliminar la venta?"
        onCancel={() => {
          setOpenDelete(false);
        }}
        onAcept={handleDelete}
        blockButton={false}
        onClose={() => {
          setOpenDelete(false);
        }}
        visible={openDelete}
      />
      
      <BillingModal
        open={openBilling}
        onOpenChange={setOpenBilling}
        sale={sale}
        onSuccess={() => {
          setOpenBilling(false);
        }}
      />

    </div>
  );
};

export default SaleAccordion;
