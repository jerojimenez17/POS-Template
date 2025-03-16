"use client";
import PrintableTable from "./PrintableTable";
const ProductsTable = () => {
  return (
    <div className="h-full w-full">
      <PrintableTable print={false} className="h-full w-full" />
    </div>
  );
};

export default ProductsTable;
