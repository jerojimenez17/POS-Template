"use client";
import { Session } from "next-auth";
import PrintableTable from "./PrintableTable";
import BillButtons from "./BillButtons";
import React, { useState, useRef, useContext, useEffect } from "react";
import CAE from "@/models/CAE";
import BillState from "@/models/BillState";
import { BillContext } from "@/context/BillContext";

interface props {
  session: Session | null;
  isEditing?: boolean;
  orderId?: string;
}
const ProductsTable = ({ session, isEditing, orderId }: props) => {
  const [printTrigger, setPrintTrigger] = useState<{count: number, cae?: CAE, snapshot?: BillState}>({count: 0});
  const printWindowRef = useRef<Window | null>(null);
  const { BillState } = useContext(BillContext);

  useEffect(() => {
    if (BillState.products.length === 0 && (printTrigger.cae?.CAE || printTrigger.snapshot)) {
      const t = setTimeout(() => {
        setPrintTrigger(prev => {
          const needsClean = prev.cae?.CAE || prev.snapshot;
          return needsClean ? { ...prev, cae: undefined, snapshot: undefined } : prev;
        });
      }, 900);
      return () => clearTimeout(t);
    }
  }, [BillState.products.length, BillState.CAE?.CAE, printTrigger.cae?.CAE, printTrigger.snapshot]);

  const handlePrint = (cae?: CAE, win?: Window | null, snapshot?: BillState) => {
    printWindowRef.current = win || null;
    setPrintTrigger(prev => ({ count: prev.count + 1, cae, snapshot }));
  };

  return (
    <div className="h-full w-full">
      <PrintableTable
        session={session}
        printTrigger={printTrigger.count}
        forceCae={printTrigger.cae}
        printSnapshot={printTrigger.snapshot}
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
