import BillParametersForm from "@/components/Billing/BillParametersForm";
import ProductsTable from "@/components/Billing/ProductsTable";
import BillProvider from "@/context/BillProvider";
import { auth } from "../../../../auth";
import Spinner from "@/components/ui/Spinner";
import { Suspense } from "react";

const NewBillPage = async () => {
  const session = await auth();
  return (
    <Suspense fallback={<Spinner />}>
      <div className="min-h-screen bg-slate-50 dark:bg-gray-900 pb-20">
        <BillProvider>
          {/* Header Section */}
          <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
            <div className="max-w-7xl mx-auto">
              <BillParametersForm />
            </div>
          </div>
          
          {/* Products Table */}
          <div className="max-w-7xl mx-auto px-4 py-6">
            <ProductsTable session={session} />
          </div>
        </BillProvider>
      </div>
    </Suspense>
  );
};

export default NewBillPage;
