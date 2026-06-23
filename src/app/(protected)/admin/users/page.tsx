import { getBusinessUsers } from "@/components/actions/users";
import { UsersTable } from "@/components/admin/users-table";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getCashboxes } from "@/actions/cashbox";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users } from "lucide-react";

export const metadata = {
  title: "Administrar Vendedores",
};

export default async function AdminUsersPage() {
  const session = await auth();

  // If not an admin, boot them
  if (!session || !session.user || session.user.role !== "ADMIN") {
    redirect("/");
  }

  const { error, data } = await getBusinessUsers();
  const cashboxesResult = await getCashboxes();
  const cashboxes = cashboxesResult.success ? cashboxesResult.data : [];

  if (error || !data) {
    return (
      <div className="flex w-full items-center justify-center p-8 text-red-500">
        Ocurrió un error cargando los vendedores: {error}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900 pb-20">
      <header className="p-4 md:p-6 border-b bg-white dark:bg-gray-900 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild title="Volver">
            <Link href="/admin">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <Users className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Vendedores</h1>
              <p className="text-sm text-gray-500 hidden sm:block">Gestioná los accesos de tus vendedores</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <UsersTable users={data} cashboxes={cashboxes} />
      </div>
    </div>
  );
}
