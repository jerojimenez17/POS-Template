import BillParametersForm from "@/components/Billing/BillParametersForm";
import ProductsTable from "@/components/Billing/ProductsTable";
import PrintModeSelector from "@/components/Billing/PrintModeSelector";
import BillProvider from "@/context/BillProvider";
import { auth } from "../../../../auth";
import { Suspense } from "react";
import Spinner from "@/components/ui/Spinner";
import { getActiveSession } from "@/actions/cashbox";
import { SessionManager } from "@/components/cashbox/SessionManager";
import { getBusinessPrintSettingsAction } from "@/actions/business-print-settings";
import { getDefaultBillType } from "@/utils/billing";

const NewBillPage = async () => {
  const [session, activeSessionResult, printSettings] = await Promise.all([
    auth(),
    getActiveSession(),
    getBusinessPrintSettingsAction(),
  ]);
  const hasActiveSession = activeSessionResult.success && activeSessionResult.data !== null;

  let ptoVentas: number[] = [];
  let initialBillType = "Factura C";
  if (session?.user?.businessId) {
    const { db } = await import("@/lib/db");
    const business = await db.business.findUnique({
      where: { id: session.user.businessId },
      select: { ptoVenta: true, condicionIva: true }
    });
    ptoVentas = business?.ptoVenta || [];
    initialBillType = getDefaultBillType(business?.condicionIva);
  }

  const qzTrayEnabled = "qzTray" in printSettings ? printSettings.qzTray : false;
  return (
    <Suspense fallback={<Spinner />}>
      <div className="min-h-screen bg-slate-50 dark:bg-gray-900 pb-20">
        <BillProvider initialBillType={initialBillType} qzTrayEnabled={qzTrayEnabled}>
          {/* Header Section */}
          <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <BillParametersForm ptoVentas={ptoVentas} initialBillType={initialBillType} />
              <div className="flex items-center gap-3">
                <SessionManager hasActiveSession={hasActiveSession} />
                <PrintModeSelector />
              </div>
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
