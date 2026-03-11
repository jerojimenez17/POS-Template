import { getSaleByIdAction } from "@/actions/sales";
import { auth } from "@/auth";
import SaleDetail from "@/components/Billing/SaleDetail";
import { notFound } from "next/navigation";

interface props {
  params: Promise<{ id: string }>;
}

const SalePage = async ({ params }: props) => {
  const { id } = await params;
  const session = await auth();
  const sale = await getSaleByIdAction(id);

  if (!sale) {
    notFound();
  }

  const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN";

  return (
    <div className="flex flex-col items-center w-full max-w-7xl mx-auto px-4 py-8 space-y-6 overflow-auto mb-10">
      <SaleDetail sale={sale} isAdmin={isAdmin} />
    </div>
  );
};

export default SalePage;
