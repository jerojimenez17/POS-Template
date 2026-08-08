import PeriodicReport from "@/components/PeriodicReport";
import ReportHeader from "@/components/report/ReportHeader";
import { auth } from "../../../../auth";
import { Suspense } from "react";
import Spinner from "@/components/ui/Spinner";

const ReportPage = async () => {
  const session = await auth();
  return (
    <main className="h-full flex flex-col">
      <ReportHeader />
      <div className="space-y-12 pb-24 h-full overflow-y-auto p-4 md:p-6">
        <Suspense fallback={<Spinner />}>
          <PeriodicReport session={session} period="daily" />
        </Suspense>
        <Suspense fallback={<Spinner />}>
          <PeriodicReport session={session} period="monthly" />
        </Suspense>
        <Suspense fallback={<Spinner />}>
          <PeriodicReport session={session} period="yearly" />
        </Suspense>
      </div>
    </main>
  );
};
export default ReportPage;
