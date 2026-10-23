import FilterBillPanel from "@/components/Billing/FilterBillPanel";
import SalesTable from "@/components/Billing/SalesTable";
import { auth } from "../../../../auth";
import { Suspense } from "react";
import Spinner from "@/components/ui/Spinner";
import { getBusinessPrintSettingsAction } from "@/actions/business-print-settings";

export const dynamic = 'force-dynamic';

const SearchBillContent = async () => {
  const [session, printSettings] = await Promise.all([
    auth(),
    getBusinessPrintSettingsAction(),
  ]);
  const qzTrayEnabled = "qzTray" in printSettings ? printSettings.qzTray : false;

  return (
    <div className="flex flex-col items-center w-full max-w-7xl mx-auto px-4 py-8 space-y-6 overflow-auto mb-10">
      <FilterBillPanel />
      <div className="w-full">
        {/* SalesTable owns the first query so it can use the hydrated filter snapshot. */}
        <SalesTable sales={[]} nextCursor={null} session={session} qzTrayEnabled={qzTrayEnabled} />
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
