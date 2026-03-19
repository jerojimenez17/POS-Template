import { auth } from "@/auth";
import { getUnpaidOrders } from "@/actions/unpaid-orders";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Eye, 
  CreditCard, 
  XCircle,
  ArrowLeft,
  Loader2,
  User,
  Calendar,
  DollarSign
} from "lucide-react";
import { Suspense } from "react";

type StatusFilter = "all" | "inpago" | "pago" | "cancelado";

type OrderWithClient = {
  id: string;
  date: Date;
  total: number;
  paidStatus: string;
  clientId: string | null;
  client: { id: string; name: string | null } | null;
};

interface OrdersTableProps {
  status: StatusFilter;
}

async function OrdersTable({ status }: OrdersTableProps) {
  const session = await auth();
  if (!session?.user?.businessId) {
    redirect("/");
  }

  const statusParam = status === "inpago" ? undefined : status;
  const result = await getUnpaidOrders({
    businessId: session.user.businessId,
    status: statusParam,
  }) as { success: boolean; data?: OrderWithClient[]; error?: string };

  if (!result.success) {
    return (
      <div className="text-center py-8 text-red-500">
        Error al cargar las órdenes: {result.error}
      </div>
    );
  }

  const orders = result.data || [];

  if (orders.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No se encontraron órdenes
      </div>
    );
  }

  const getStatusBadge = (paidStatus: string) => {
    switch (paidStatus) {
      case "inpago":
        return <Badge variant="destructive">Pendiente</Badge>;
      case "pago":
        return <Badge className="bg-green-500 hover:bg-green-600">Pagado</Badge>;
      default:
        return <Badge variant="outline">{paidStatus}</Badge>;
    }
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cliente</TableHead>
          <TableHead>Total</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => (
          <TableRow key={order.id}>
            <TableCell className="font-medium">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                {order.client?.name || "Sin cliente"}
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                ${order.total.toLocaleString("es-AR")}
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {formatDate(order.date)}
              </div>
            </TableCell>
            <TableCell>{getStatusBadge(order.paidStatus)}</TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/account-ledger/${order.id}`}>
                    <Eye className="h-4 w-4 mr-1" />
                    Ver
                  </Link>
                </Button>
                {order.paidStatus !== "pago" && (
                  <>
                    <Button variant="default" size="sm" asChild>
                      <Link href={`/account-ledger/${order.id}?action=payment`}>
                        <CreditCard className="h-4 w-4 mr-1" />
                        Pagar
                      </Link>
                    </Button>
                    <Button variant="destructive" size="sm" asChild>
                      <Link href={`/account-ledger/${order.id}?action=cancel`}>
                        <XCircle className="h-4 w-4 mr-1" />
                        Cancelar
                      </Link>
                    </Button>
                  </>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default async function AccountLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const status = (params.status as StatusFilter) || "all";

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Volver
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Cuenta Corriente</h1>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex gap-2 border-b pb-2">
          <StatusTab status="all" currentStatus={status} />
          <StatusTab status="inpago" label="Pendientes" currentStatus={status} />
          <StatusTab status="pago" label="Pagados" currentStatus={status} />
        </div>

        <Suspense
          fallback={
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <OrdersTable status={status} />
        </Suspense>
      </div>
    </div>
  );
}

function StatusTab({
  status,
  label,
  currentStatus,
}: {
  status: StatusFilter;
  label?: string;
  currentStatus: StatusFilter;
}) {
  const getTabLabel = () => {
    if (label) return label;
    switch (status) {
      case "all":
        return "Todos";
      case "inpago":
        return "Pendientes";
      case "pago":
        return "Pagados";
      default:
        return status;
    }
  };

  return (
    <Button
      variant="ghost"
      className="rounded-b-none border-b-2 border-transparent data-[active=true]:border-primary"
      asChild
    >
      <Link
        href={`/account-ledger?status=${status}`}
        data-active={status === currentStatus ? "true" : undefined}
      >
        {getTabLabel()}
      </Link>
    </Button>
  );
}
