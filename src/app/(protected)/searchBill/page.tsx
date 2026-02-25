import FilterBillPanel from "@/components/Billing/FilterBillPanel";
import SalesTable from "@/components/Billing/SalesTable";
import { auth } from "../../../../auth";
import { Suspense } from "react";
import Spinner from "@/components/ui/Spinner";
import { getSalesAction } from "@/actions/sales";

const SearchBillContent = async () => {
  const session = await auth();
  const sales = await getSalesAction();

  return (
    <div className="flex flex-col items-center w-full max-w-7xl mx-auto px-4 py-8 space-y-6 overflow-auto mb-10">
      <FilterBillPanel session={session} />
      <div className="w-full">
        <SalesTable sales={sales} session={session} />
      </div>
    </div>
  );
};

const page = () => {
  return (
    <div className="h-full">
      <Suspense fallback={
        <div className="flex justify-center items-center h-[50vh]">
          <Spinner />
        </div>
      }>
        <SearchBillContent />
      </Suspense>
    </div>
  );
};

export default page;
