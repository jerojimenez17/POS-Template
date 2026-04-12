"use client";
import { Session } from "next-auth";
import PrintableTable from "./PrintableTable";
import BillButtons from "./BillButtons";
import { useState, useRef } from "react";
import CAE from "@/models/CAE";

interface props {
  session: Session | null;
  isEditing?: boolean;
  orderId?: string;
}
const ProductsTable = ({ session, isEditing, orderId }: props) => {
  const [printTrigger, setPrintTrigger] = useState<{count: number, cae?: CAE}>({count: 0});
  const printWindowRef = useRef<Window | null>(null);

  const handlePrint = (cae?: CAE, win?: Window | null) => {
    printWindowRef.current = win || null;
    setPrintTrigger(prev => ({ count: prev.count + 1, cae }));
  };

  return (
    <div className="h-full w-full">
      <PrintableTable
        session={session}
        printTrigger={printTrigger.count}
        forceCae={printTrigger.cae}
        targetWindowRef={printWindowRef}
        className="h-auto w-full"
        handleClose={function (): void {
          // handleClose currently not implemented or needed here
          console.warn("handleClose not implemented");
        }}
      />

      <div className="flex flex-col relative">
        <BillButtons 
           session={session} 
           handlePrint={handlePrint} 
           isEditing={isEditing}
           orderId={orderId}
        />
      </div>
    </div>
  );
};

export default ProductsTable;
