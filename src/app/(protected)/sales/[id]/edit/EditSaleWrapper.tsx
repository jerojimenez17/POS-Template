"use client";

import { useEffect, useContext, useState, useRef } from "react";
import BillParametersForm from "@/components/Billing/BillParametersForm";
import ProductsTable from "@/components/Billing/ProductsTable";
import { BillContext } from "@/context/BillContext";
import BillState from "@/models/BillState";
import { Session } from "next-auth";
import Spinner from "@/components/ui/Spinner";

interface EditSaleWrapperProps {
  sale: BillState;
  session: Session | null;
}

const EditSaleWrapper = ({ sale, session }: EditSaleWrapperProps) => {
  const { setState } = useContext(BillContext);
  const [isInitializing, setIsInitializing] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    if (sale && !initialized.current) {
      setState(sale);
      initialized.current = true;
      // Allow a brief moment for the context to update before rendering
      setTimeout(() => setIsInitializing(false), 50);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale]);

  if (isInitializing) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full mb-5 pb-16 overflow-y-auto overflow-x-hidden scrollbar-gutter-stable">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Editar Venta</h1>
      </div>
      <div className="h-fit py-4 container mb-3 mx-auto w-full border-b border-gray-100 dark:border-gray-800">
        <BillParametersForm />
      </div>
      <ProductsTable session={session} isEditing={true} orderId={sale.id} />
    </div>
  );
};

export default EditSaleWrapper;
