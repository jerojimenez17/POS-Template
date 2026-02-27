import DailyReport from "@/components/DailyReport";
import { auth } from "../../../../auth";

const DailyReportPage = async () => {
  await auth();
  return <DailyReport />;
};
export default DailyReportPage;
