import PickDateStockRanking from "@/components/stock/pick-date-stock-ranking";
import ProductRanking from "@/components/stock/product-ranking";
import { Suspense } from "react";

const page = () => {
  return (
    <div className="h-full w-full">
      <Suspense fallback={<div>Cargando selector de mes...</div>}>
        <PickDateStockRanking />

        <ProductRanking />
      </Suspense>
    </div>
  );
};
export default page;
