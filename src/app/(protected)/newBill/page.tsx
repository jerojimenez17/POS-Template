import ProductsTable from "@/components/Billing/ProductsTable";
import BillProvider from "@/context/BillProvider";
import { auth } from "../../../../auth";
import { Suspense } from "react";
import Spinner from "@/components/ui/Spinner";
import { getActiveSession } from "@/actions/cashbox";
import NewBillHeaderActions from "@/components/Billing/NewBillHeaderActions";

const NewBillPage = async () => {
  const [session, activeSessionResult] = await Promise.all([
    auth(),
    getActiveSession(),
  ]);
  const hasActiveSession = activeSessionResult.success && activeSessionResult.data !== null;

  let ptoVentas: number[] = [];
  if (session?.user?.businessId) {
    const { db } = await import("@/lib/db");
    const business = await db.business.findUnique({
      where: { id: session.user.businessId },
      select: { ptoVenta: true }
    });
    ptoVentas = business?.ptoVenta || [];
  }

  return (
    <Suspense fallback={<Spinner />}>
      <div className="min-h-screen bg-slate-50 dark:bg-gray-900 pb-20 overflow-x-hidden">
        <BillProvider>
          <NewBillHeaderActions hasActiveSession={hasActiveSession} session={session} />
          <div className="max-w-7xl mx-auto px-4 py-6">
            <ProductsTable session={session} ptoVentas={ptoVentas} />
          </div>
        </BillProvider>
      </div>
    </Suspense>
  );
};
export default NewBillPage;
