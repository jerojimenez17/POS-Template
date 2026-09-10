import FilterBillPanel from "@/components/Billing/FilterBillPanel";
import SalesTable from "@/components/Billing/SalesTable";
import { auth } from "../../../../auth";
import { Suspense } from "react";
import Spinner from "@/components/ui/Spinner";
import { getSalesAction } from "@/actions/sales";
import { getSalesWithReturnsAction } from "@/actions/sales/returns";
import SaleHistoryEntryRow from "@/components/Billing/SaleHistoryEntryRow";
import { getBusinessPrintSettingsAction } from "@/actions/business-print-settings";

export const dynamic = 'force-dynamic';

const SearchBillContent = async () => {
  const session = await auth();
  const [{ sales, nextCursor }, printSettings, salesWithReturns] = await Promise.all([getSalesAction(), getBusinessPrintSettingsAction(), getSalesWithReturnsAction({ take: 100 })]);
  const qzTrayEnabled = "qzTray" in printSettings ? printSettings.qzTray : false;
  const entries = salesWithReturns.entries;
  const returnsTotal = entries.filter((e) => e.kind === "RETURN").reduce((a, e) => a + e.total, 0);
  const netTotal = entries.filter((e) => e.kind === "SALE").reduce((a, e) => a + e.total, 0) - returnsTotal;

  return (
    <div className="flex flex-col items-center w-full max-w-7xl mx-auto px-4 py-8 space-y-6 overflow-auto mb-10">
      <FilterBillPanel />
      <div className="w-full space-y-6">
        {entries.length > 0 && (
          <div className="w-full bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Historial (ventas y devoluciones)</h2>
              <p className="text-xs text-muted-foreground">Neto: ${netTotal}</p>
            </div>
            <div className="divide-y">
              {entries.map((e) => (
                <SaleHistoryEntryRow key={e.id} entry={e} />
              ))}
            </div>
          </div>
        )}
        <SalesTable sales={sales} nextCursor={nextCursor} session={session} qzTrayEnabled={qzTrayEnabled} returnsTotal={returnsTotal} />
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
