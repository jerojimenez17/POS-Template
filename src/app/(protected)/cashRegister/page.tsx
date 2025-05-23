import CashRegister from "@/components/CashRegister";
import { auth } from "../../../../auth";

const page = async () => {
  const session = await auth();
  return <CashRegister session={session} />;
};
export default page;
