import { getBusinessUsers } from "@/components/actions/users";
import { UsersTable } from "@/components/admin/users-table";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getCashboxes } from "@/actions/cashbox";

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
    <div className="flex flex-col w-full min-h-[80vh] p-4 md:p-8 max-w-6xl mx-auto">
      <UsersTable users={data} cashboxes={cashboxes} />
    </div>
  );
}
