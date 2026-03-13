"use client";
import { Session } from "next-auth";
import PrintableTable from "./PrintableTable";
import BillButtons from "./BillButtons";
import { useState } from "react";

interface props {
  session: Session | null;
  isEditing?: boolean;
  orderId?: string;
}
const ProductsTable = ({ session, isEditing, orderId }: props) => {
  const [printTrigger, setPrintTrigger] = useState(0);
  return (
    <div className="h-full w-full">
      <PrintableTable
        session={session}
        printTrigger={printTrigger}
        className="h-auto w-full"
        handleClose={function (): void {
          // handleClose currently not implemented or needed here
          console.warn("handleClose not implemented");
        }}
      />

      <div className="flex flex-col relative">
        <BillButtons 
           session={session} 
           handlePrint={() => setPrintTrigger(prev => prev + 1)} 
           isEditing={isEditing}
           orderId={orderId}
        />
      </div>
    </div>
  );
};

export default ProductsTable;
