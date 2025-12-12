import BillParametersForm from "@/components/Billing/BillParametersForm";
import ProductsTable from "@/components/Billing/ProductsTable";
import BillProvider from "@/context/BillProvider";
import { auth } from "../../../../auth";
import Spinner from "@/components/ui/Spinner";
import { Suspense } from "react";

const page = async () => {
  const session = await auth();
  return (
     <Suspense fallback={<Spinner/>}>
      
    <BillProvider>
      <div className="flex flex-col max-h-full mb-5 pb-16 overflow-auto">
        <div className="h-fit py-4 md:h-1/4 container my-3 mx-auto w-full shadow rounded-xl">
          <BillParametersForm />
        </div>
        <ProductsTable session={session} />
      </div>
    </BillProvider>
     </Suspense>
  );
};

export default page;
