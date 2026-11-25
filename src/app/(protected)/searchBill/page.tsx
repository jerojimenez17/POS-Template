import FilterBillPanel from "@/components/Billing/FilterBillPanel";
import SalesTable from "@/components/Billing/SalesTable";
import { auth } from "../../../../auth";
import { Suspense } from "react";
import Spinner from "@/components/ui/Spinner";
import { getSalesAction } from "@/actions/sales/get-sales";
import { SalesQuerySchema, type SalesQueryInput } from "@/schemas/sales-query";
import SearchBillHeader from "@/components/Billing/SearchBillHeader";
import { getBusinessPrintSettingsAction } from "@/actions/business-print-settings";
import { UserRole } from "@prisma/client";

export const dynamic = 'force-dynamic';

export const SearchBillContent = async ({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; showAll?: string }>;
}) => {
  const [session, params] = await Promise.all([
    auth(),
    searchParams,
  ]);
  const parsedQuery = SalesQuerySchema.safeParse({
    from: params.from,
    to: params.to,
  });
  const salesQuery: SalesQueryInput = parsedQuery.success ? parsedQuery.data : {};
  const canViewAllSellers = session?.user?.role === UserRole.ADMIN || session?.user?.role === UserRole.SUPER_ADMIN;
  const [salesResult, printSettings] = await Promise.all([
    session?.user?.businessId
      ? getSalesAction(salesQuery)
      : Promise.resolve({ sales: [], nextCursor: null, error: "Sin negocio asociado" }),
    getBusinessPrintSettingsAction(),
  ]);
  const { sales, nextCursor } = salesResult;
  const qzTrayEnabled = "qzTray" in printSettings ? printSettings.qzTray : false;
  const initialParams: { from?: string; to?: string; showAll?: string } = {};
  if (parsedQuery.success) {
    if (parsedQuery.data.from) initialParams.from = parsedQuery.data.from;
    if (parsedQuery.data.to) initialParams.to = parsedQuery.data.to;
  }
  if (canViewAllSellers && params.showAll === "true") initialParams.showAll = "true";
  const directVisit = !params.from && !params.to && !params.showAll;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-gray-950">
      <SearchBillHeader initialParams={initialParams} canViewAllSellers={canViewAllSellers} directVisit={directVisit} />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
          <FilterBillPanel canViewAllSellers={canViewAllSellers} sellerEmail={session?.user?.email} />
          <SalesTable
            sales={sales}
            nextCursor={nextCursor}
            session={session}
            qzTrayEnabled={qzTrayEnabled}
            salesQuery={salesQuery}
            emptyState={salesResult.error}
          />
        </div>
      </div>
    </div>
  );
};

const SearchBillPage = ({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; showAll?: string }>;
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
