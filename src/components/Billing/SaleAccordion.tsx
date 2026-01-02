import BillState from "@/models/BillState";
import BillingModal from "./BillingModal";
import React, { useState } from "react";
import PrintButton from "./PrintButton";
import { deleteDoc, doc } from "firebase/firestore";
import { User } from "firebase/auth";
import DeleteButton from "../DeleteButton";
import Modal from "../Modal";
import { db } from "@/firebase/config";

interface props {
  sale: BillState;
  onClick: () => void;
  user: User | null;
}
const SaleAccordion = ({ sale, onClick, user }: props) => {
  const [openDelete, setOpenDelete] = useState(false);
  const [deleteSale, setDeleteSale] = useState<BillState>();
  const [openBilling, setOpenBilling] = useState(false);

  return (
    <div className="rounded p-3 bg-white shadow-sm m-1 row max-w-full text-2xs sm:text-md md:text-lg">
      <div className="flex items-center justify-around gap-2 align-middle">
        <div className="col w-1/4">
          <p>{sale.date?.toLocaleDateString()}</p>
        </div>
        <div className="col w-1/4">
          {sale.CAE?.CAE && sale.CAE.CAE !== "" ? (
            sale.CAE.CAE
          ) : (
            <button
              onClick={() => setOpenBilling(true)}
              className="px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 hover:text-white transition-colors text-xs font-semibold"
            >
              Facturar
            </button>
          )}
        </div>
        <div className="col w-1/4">{sale.paidMethod}</div>
        <div className="col w-1/4">{sale.seller.split("@")[0]}</div>
        <div className="col w-1/4">
          <p>
            $
            {sale.totalWithDiscount
              ? sale.totalWithDiscount.toLocaleString("es-AR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : sale.total}
          </p>
        </div>
        <div className="col w-1/8" onClick={onClick}>
          <PrintButton onClick={onClick} />
        </div>
        <div className="col w-1/8" onClick={() => setOpenDelete(true)}>
          <DeleteButton
            disable={user?.email !== process.env.ADMIN_EMAIL}
            onClick={() => {
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
