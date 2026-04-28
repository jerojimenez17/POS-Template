import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getCashboxes } from "@/actions/cashbox";
import { CashboxesManager } from "@/components/admin/cashboxes-manager";

export const metadata = {
  title: "Administrar Cajas",
};

export default async function AdminCashboxesPage() {
  const session = await auth();

  if (!session || !session.user || session.user.role !== "ADMIN") {
    redirect("/");
  }

  const result = await getCashboxes();
  const cashboxes = result.success ? result.data ?? [] : [];

  return (
    <div className="flex flex-col w-full min-h-[80vh] p-4 md:p-8 max-w-6xl mx-auto">
      <CashboxesManager cashboxes={cashboxes} />
    </div>
  );
}
