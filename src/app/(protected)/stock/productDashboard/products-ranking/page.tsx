"use client";

import PickDateStockRanking from "@/components/stock/pick-date-stock-ranking";
import ProductRanking from "@/components/stock/product-ranking";

const page = () => {
  return (
    <div className="h-full w-full">
      <PickDateStockRanking />
      <ProductRanking />
    </div>
  );
};
export default page;
