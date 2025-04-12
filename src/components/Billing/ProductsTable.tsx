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
        className="h-full w-full"
      />

      <BillButtons session={session} handlePrint={() => setPrint(!print)} />
    </div>
  );
};

export default ProductsTable;
