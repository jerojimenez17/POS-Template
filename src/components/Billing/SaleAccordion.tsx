import { Eye } from "lucide-react";
import Link from "next/link";
import BillState from "@/models/BillState";
import BillingModal from "./BillingModal";
import React, { useState } from "react";
import PrintOptionsPopover from "./PrintOptionsPopover";
import { deleteDoc, doc } from "firebase/firestore";
import { User } from "firebase/auth";
import DeleteButton from "../DeleteButton";
import Modal from "../Modal";
import { db } from "@/firebase/config";
import { Session } from "next-auth";
import { formatLocalDate } from "@/utils/date";

interface props {
  sale: BillState;
  user: User | null;
  session: Session | null;
}
const SaleAccordion = ({ sale, user, session }: props) => {
  const [openDelete, setOpenDelete] = useState(false);
  const [deleteSale, setDeleteSale] = useState<BillState>();
  const [openBilling, setOpenBilling] = useState(false);

  return (
    <div className="rounded p-4 bg-white shadow-sm hover:shadow-md transition-shadow m-1 border border-gray-100 dark:border-gray-800 text-xs sm:text-sm md:text-base w-175 sm:w-full min-w-max">
      <div className="grid grid-cols-[2fr_2fr_2fr_3fr_2fr_40px_40px_40px] items-center gap-4 text-gray-700 dark:text-gray-300">
        {/* Date */}
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {sale.date ? formatLocalDate(sale.date) : ""}
        </div>

        {/* Invoice / CAE */}
        <div>
          {sale.CAE?.CAE && sale.CAE.CAE !== "" ? (
            <span className="text-gray-600 dark:text-gray-400 font-mono text-xs">
              {sale.CAE.CAE}
            </span>
          ) : (
            <button
              onClick={() => setOpenBilling(true)}
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

        {/* Action: Detail */}
        <Link
          href={`/sales/${sale.id}`}
          className="flex justify-center items-center cursor-pointer p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          title="Ver Detalle"
        >
          <Eye className="h-4 w-4 text-gray-500" />
        </Link>

        {/* Action: Print */}
        <div className="flex justify-center items-center">
          <PrintOptionsPopover sale={sale} session={session} />
        </div>

        {/* Action: Delete */}
        <div className="flex justify-center items-center p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors">
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
        onAcept={async () => {
          if (deleteSale) {
            await deleteDoc(doc(db, "sales", deleteSale?.id));
            setOpenDelete(false);
          }
        }}
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
