import ProductDashboad from "@/components/stock/product-dashboard";
import { auth } from "../../../../../auth";
import { Suspense } from "react";
import Spinner from "@/components/ui/Spinner";

const ProductDashboardPage = async () => {
  await auth();

  return <Suspense fallback={<Spinner/>}> 
   <ProductDashboad />;
   </Suspense>
};

export default ProductDashboardPage;
