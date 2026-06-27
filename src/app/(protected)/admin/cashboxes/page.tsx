import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getCashboxes } from "@/actions/cashbox";
import { CashboxesManager } from "@/components/admin/cashboxes-manager";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Box } from "lucide-react";

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
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900 pb-20">
      <header className="p-4 md:p-6 border-b bg-white dark:bg-gray-900 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild title="Volver">
            <Link href="/">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <Box className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Cajas</h1>
              <p className="text-sm text-gray-500 hidden sm:block">Gestioná las cajas y saldos</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <CashboxesManager cashboxes={cashboxes} />
      </div>
    </div>
  );
}
