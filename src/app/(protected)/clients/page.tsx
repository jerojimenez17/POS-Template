import { auth } from "@/auth";
import { getClients } from "@/actions/clients";
import ClientsPageClient from "@/components/clients/ClientsPageClient";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const session = await auth();
  if (!session?.user?.businessId) redirect("/");
  const result = await getClients();
  return <ClientsPageClient clients={result.success ? result.data ?? [] : []} initialError={result.success ? undefined : result.error} />;
}
