import ProductDashboad from "@/components/stock/product-dashboard";
import { auth } from "../../../../../auth";
import { Suspense } from "react";
import Spinner from "@/components/ui/Spinner";

const page = async () => {
  const session = await auth();

  return <Suspense fallback={<Spinner/>}> 
   <ProductDashboad session={session} />;
   </Suspense>
};

export default page;
