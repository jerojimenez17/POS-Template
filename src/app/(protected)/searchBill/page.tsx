import FilterBillPanel from "@/components/Billing/FilterBillPanel";
import SalesTable from "@/components/Billing/SalesTable";
import { auth } from "../../../../auth";
import { Suspense } from "react";
import Spinner from "@/components/ui/Spinner";
import { getSalesAction } from "@/actions/sales";
import SearchBillHeader from "@/components/Billing/SearchBillHeader";

export const dynamic = 'force-dynamic';

const SearchBillContent = async () => {
  const session = await auth();
  const { sales, nextCursor } = await getSalesAction();

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-gray-950">
      <SearchBillHeader />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
          <FilterBillPanel />
          <SalesTable sales={sales} nextCursor={nextCursor} session={session} />
        </div>
      </div>
    </div>
  );
};

const SearchBillPage = () => {
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

export default SearchBillPage;
