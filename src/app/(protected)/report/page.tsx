import PeriodicReport from "@/components/PeriodicReport";
import { auth } from "../../../../auth";

const ReportPage = async () => {
  const session = await auth();
  return (
    <div className="space-y-12 pb-24 h-full overflow-y-auto pt-4">
      <PeriodicReport session={session} period="daily" />
      <PeriodicReport session={session} period="monthly" />
      <PeriodicReport session={session} period="yearly" />
    </div>
  );
};
export default ReportPage;
