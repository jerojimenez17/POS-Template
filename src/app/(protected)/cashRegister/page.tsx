import CashRegister from "@/components/CashRegister";
import { auth } from "../../../../auth";

const CashRegisterPage = async () => {
  const session = await auth();
  return <CashRegister session={session} />;
};
export default CashRegisterPage;
