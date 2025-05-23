"use client";
import { Session } from "next-auth";
import PrintableTable from "./PrintableTable";
import BillButtons from "./BillButtons";
import { useState } from "react";

interface props {
  session: Session | null;
}
const ProductsTable = ({ session }: props) => {
  const [print, setPrint] = useState(false);
  return (
    <div className="h-full w-full">
      <PrintableTable
        session={session}
        print={print}
        className="h-3/5 print:h-3/4 w-full overflow-auto"
        handleClose={function (): void {
          throw new Error("Function not implemented.");
        }}
      />

      <div className="flex flex-col relative">
        <BillButtons session={session} handlePrint={() => setPrint(!print)} />
      </div>
    </div>
  );
};

export default ProductsTable;
