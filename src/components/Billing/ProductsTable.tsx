"use client";
import { Session } from "next-auth";
import PrintableTable from "./PrintableTable";
import BillButtons from "./BillButtons";
import { useState, useRef, useCallback } from "react";
import CAE from "@/models/CAE";

interface props {
  session: Session | null;
  isEditing?: boolean;
  orderId?: string;
  ptoVentas?: number[];
}
const ProductsTable = ({ session, isEditing, orderId, ptoVentas }: props) => {
  const [printTrigger, setPrintTrigger] = useState<{count: number, cae?: CAE}>({count: 0});
  const targetWindowRef = useRef<Window | null>(null);

  const handlePrint = useCallback((cae?: CAE, win?: Window | null) => {
    targetWindowRef.current = win || null;
    setPrintTrigger(prev => ({ count: prev.count + 1, cae }));
  }, []);

  return (
    <div className="h-full w-full">
      <PrintableTable
        session={session}
        printTrigger={printTrigger.count}
        forceCae={printTrigger.cae}
        targetWindowRef={targetWindowRef}
        className="h-auto w-full"
        handleClose={function (): void {
          console.warn("handleClose not implemented");
        }}
      />
      <div className="flex flex-col relative">
        <BillButtons
          session={session}
          handlePrint={handlePrint}
          ptoVentas={ptoVentas}
        />
      </div>
    </div>
  );
};

export default ProductsTable;
