import PeriodicReport from "@/components/PeriodicReport";
import { auth } from "../../../../auth";
import { Suspense } from "react";
import Spinner from "@/components/ui/Spinner";

const ReportPage = async () => {
  const session = await auth();
  return (
    <div className="space-y-12 pb-24 h-full overflow-y-auto pt-4">
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
  );
};
export default ReportPage;
