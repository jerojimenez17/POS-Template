import FilterBillPanel from "@/components/Billing/FilterBillPanel";
import SalesTable from "@/components/Billing/SalesTable";
import { auth } from "../../../../auth";
import { Suspense } from "react";
import Spinner from "@/components/ui/Spinner";
import { getSalesAction } from "@/actions/sales";
import SearchBillHeader from "@/components/Billing/SearchBillHeader";

export const dynamic = 'force-dynamic';

const SearchBillContent = async ({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; showAll?: string }>;
}) => {
  const [session, params] = await Promise.all([
    auth(),
    searchParams,
  ]);
  const { sales, nextCursor } = await getSalesAction();
  const initialParams: { from?: string; to?: string; showAll?: string } = {};
  if (params.from) initialParams.from = params.from;
  if (params.to) initialParams.to = params.to;
  if (params.showAll) initialParams.showAll = params.showAll;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-gray-950">
      <SearchBillHeader initialParams={initialParams} />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
          <FilterBillPanel />
          <SalesTable sales={sales} nextCursor={nextCursor} session={session} />
        </div>
      </div>
    </div>
  );
};

const SearchBillPage = ({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) => {
  return (
    <div className="h-full">
      <Suspense fallback={
        <div className="flex justify-center items-center h-[50vh]">
          <Spinner />
        </div>
      }>
        <SearchBillContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
};

export default SearchBillPage;
