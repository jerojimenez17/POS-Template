import DailyReport from "@/components/DailyReport";
import { auth } from "../../../../auth";

const page = async () => {
  const session = await auth();
  return <DailyReport session={session} />;
};
export default page;
