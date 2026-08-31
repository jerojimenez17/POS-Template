import { auth } from "@/auth";
import { getUnpaidOrders, type AccountLedgerPage } from "@/actions/unpaid-orders";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Suspense } from "react";
import { PusherListener } from "./PusherListener";
import SearchLedger from "./SearchLedger";
import AccountLedgerList from "./AccountLedgerList";

type StatusFilter = "all" | "inpago" | "pago" | "cancelado" | "pendiente";

async function OrdersTable({ status, search }: { status: StatusFilter; search?: string }) {
  const result = await getUnpaidOrders({ businessId: "", status, search: search, limit: status === "pago" || status === "all" ? 50 : 100 });
  if (!result.success || typeof result.data !== "object" || result.data === null || !Array.isArray((result.data as AccountLedgerPage).orders)) {
    return <div className="py-8 text-center text-red-500">Error al cargar las órdenes: {result.error}</div>;
  }
  return <AccountLedgerList status={status} search={search} initialPage={result.data as AccountLedgerPage} />;
}

export default async function AccountLedgerPage({ searchParams }: { searchParams: Promise<{ status?: string; search?: string }> }) {
  const [session, params] = await Promise.all([auth(), searchParams]);
  if (!session?.user?.businessId) redirect("/");
  const status = (params.status as StatusFilter) || "inpago";
  const search = params.search;

  return <div className="container mx-auto max-w-6xl px-4 py-8">
    <PusherListener businessId={session.user.businessId} />
    <div className="mb-6 flex items-center gap-4"><Button variant="ghost" size="sm" asChild><Link href="/"><ArrowLeft className="mr-1 h-4 w-4" />Volver</Link></Button><h1 className="text-2xl font-bold">Cuenta Corriente</h1></div>
    <div className="mb-6 flex flex-col items-center justify-between gap-4 md:flex-row"><SearchLedger /></div>
    <div className="flex flex-col gap-6">
      <div className="flex gap-2 border-b pb-2"><StatusTab status="pendiente" label="Por Confirmar" currentStatus={status} /><StatusTab status="inpago" label="Pendientes de Pago" currentStatus={status} /><StatusTab status="pago" label="Pagados" currentStatus={status} /><StatusTab status="all" currentStatus={status} /></div>
      <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>}><OrdersTable status={status} search={search} /></Suspense>
    </div>
  </div>;
}

function StatusTab({ status, label, currentStatus }: { status: StatusFilter; label?: string; currentStatus: StatusFilter }) {
  const tabLabel = label || (status === "all" ? "Todos" : status === "pago" ? "Pagados" : status);
  return <Button variant="ghost" className="rounded-b-none border-b-2 border-transparent data-[active=true]:border-primary" asChild><Link href={`/account-ledger?status=${status}`} data-active={status === currentStatus ? "true" : undefined}>{tabLabel}</Link></Button>;
}
