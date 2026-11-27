import { auth } from "@/auth";
import { getClientsPage } from "@/actions/clients";
import ClientsPageClient from "@/components/clients/ClientsPageClient";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const session = await auth();
  if (!session?.user?.businessId) redirect("/");
  const result = await getClientsPage();
  const page = result.success ? result.data : undefined;
  return <ClientsPageClient clients={page?.clients ?? []} hasMore={page?.hasMore} nextCursor={page?.nextCursor} initialError={result.success ? undefined : result.error} />;
}
