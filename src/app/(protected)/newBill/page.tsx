import ProductsTable from "@/components/Billing/ProductsTable";
import BillProvider from "@/context/BillProvider";
import { auth } from "../../../../auth";
import { Suspense } from "react";
import Spinner from "@/components/ui/Spinner";
import { getActiveSession } from "@/actions/cashbox";
import NewBillHeaderActions from "@/components/Billing/NewBillHeaderActions";
import { getBusinessPrintSettingsAction } from "@/actions/business-print-settings";
import { getDefaultBillType } from "@/utils/billing";
import BillTypes from "@/models/billType";
import type { BillType } from "@/models/billType";

const NewBillPage = async () => {
  const [session, activeSessionResult, printSettings] = await Promise.all([
    auth(),
    getActiveSession(),
    getBusinessPrintSettingsAction(),
  ]);
  const hasActiveSession = activeSessionResult.success && activeSessionResult.data !== null;

  let ptoVentas: number[] = [];
  // Keep the real business default explicit on the page. Unknown billing data
  // falls back to Factura C, while Responsable Inscripto is resolved to B.
  let initialBillType: BillType = BillTypes.C;
  if (session?.user?.businessId) {
    try {
      const { db } = await import("@/lib/db");
      const business = await db.business.findUnique({
        where: { id: session.user.businessId },
        select: { ptoVenta: true, condicionIva: true }
      });
      ptoVentas = business?.ptoVenta || [];
      initialBillType = getDefaultBillType(business?.condicionIva);
    } catch (error) {
      console.error("Unable to load business billing defaults:", error);
    }
  }

  const qzTrayEnabled = "qzTray" in printSettings ? printSettings.qzTray : false;
  return (
    <Suspense fallback={<Spinner />}>
      <div className="min-h-screen bg-slate-50 dark:bg-gray-900 pb-20">
          <BillProvider initialBillType={initialBillType} defaultPtoVenta={ptoVentas[0]} qzTrayEnabled={qzTrayEnabled}>
          <NewBillHeaderActions hasActiveSession={hasActiveSession} session={session} />

          {/* Products Table */}
          <div className="max-w-7xl mx-auto px-4 py-6">
            <ProductsTable session={session} ptoVentas={ptoVentas} />
          </div>
        </BillProvider>
      </div>
    </Suspense>
  );
};

export default NewBillPage;
