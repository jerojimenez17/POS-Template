import BillState from "@/models/BillState";
import React, { useState } from "react";
import { deleteDoc, doc } from "firebase/firestore";
import DeleteButton from "../DeleteButton";
import PrintButton from "./PrintButton";
import { db } from "@/firebase/config";
import Modal from "../Modal";
import { Session } from "next-auth";
interface props {
  sale: BillState;
  session: Session | null;
  deleteSaleFunc: (sale: BillState) => void;
  onClick: () => void;
}
const SaleAccordion = ({ sale, deleteSaleFunc, onClick }: props) => {
  const [openDelete, setOpenDelete] = useState(false);
  const [deleteSale, setDeleteSale] = useState<BillState>();
  return (
    <div className="rounded p-3 bg-white shadow-sm m-1 row max-w-full text-xs sm:text-md md:text-lg">
      <div className="flex items-center justify-around gap-2 align-middle">
        <div className="col w-1/4">
          <p>{sale.date?.toLocaleDateString()}</p>
        </div>
        <div className="col w-1/4">
          {sale.CAE?.CAE !== "" ? sale.CAE?.CAE : "X"}
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
        <div className="col w-1/8">
          <DeleteButton
            disable={false}
            onClick={() => {
              setDeleteSale(sale);
              setOpenDelete(!openDelete);
            }}
          />
        </div>
      </div>
      {openDelete && (
        <Modal
          message="Desea eliminar la venta?"
          onCancel={() => {
            setOpenDelete(false);
          }}
          onAcept={async () => {
            if (deleteSale) {
              await deleteDoc(doc(db, "sales", deleteSale?.id));
              deleteSaleFunc(deleteSale);
              setOpenDelete(false);
            }
          }}
          blockButton={false}
          onClose={() => {
            setOpenDelete(false);
          }}
          visible={openDelete}
        />
      )}
    </div>
  );
};

export default SaleAccordion;
