import PickDateStockRanking from "@/components/stock/pick-date-stock-ranking";
import ProductRanking from "@/components/stock/product-ranking";
import Spinner from "@/components/ui/Spinner";
import { Suspense } from "react";

const page = () => {
  return (
    <div className="h-full w-full overflow-auto">
      <Suspense fallback={<Spinner />}>
        <PickDateStockRanking />

        <ProductRanking />
      </Suspense>
    </div>
  );
};
export default page;
