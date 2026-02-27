import BillParametersForm from "@/components/Billing/BillParametersForm";
import ProductsTable from "@/components/Billing/ProductsTable";
import BillProvider from "@/context/BillProvider";
import { auth } from "../../../../auth";
import Spinner from "@/components/ui/Spinner";
import { Suspense } from "react";

const NewBillPage = async () => {
  const session = await auth();
  return (
     <Suspense fallback={<Spinner/>}>
      
    <BillProvider>
      <div className="flex flex-col h-full mb-5 pb-16 overflow-y-auto overflow-x-hidden scrollbar-gutter-stable">
        <div className="h-fit py-4 md:h-1/4 container my-3 mx-auto w-full border-b border-gray-100 dark:border-gray-800">
          <BillParametersForm />
        </div>
        <ProductsTable session={session} />
      </div>
    </BillProvider>
     </Suspense>
  );
};

export default NewBillPage;
