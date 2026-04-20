import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft,
  User,
  Calendar,
  Package,
  CheckCircle
} from "lucide-react";
import { db } from "@/lib/db";
import AddPaymentForm from "./AddPaymentForm";
import CancelOrderButton from "./CancelOrderButton";
import EditableOrderDetailWrapper from "./EditableOrderDetailWrapper";
import { LocalDate } from "@/components/ui/LocalDate";

interface OrderWithRelations {
  id: string;
  date: Date;
  total: number;
  paidStatus: string;
  clientId: string | null;
  client: { id: string; name: string | null } | null;
  items: Array<{ id: string; productId: string | null; description: string | null; code: string | null; price: number; quantity: number; subTotal: number; addedAt: Date }>;
  cashMovements: Array<{ id: string; date: Date; total: number; paidMethod: string | null }>;
}

export default async function AccountLedgerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const { id } = await params;
  const actionParams = await searchParams;
  const session = await auth();
  
  if (!session?.user?.businessId) {
    redirect("/");
  }

  const order = await db.order.findUnique({
    where: { id, businessId: session.user.businessId },
    include: {
      client: true,
      items: true,
      cashMovements: {
        orderBy: { date: "desc" },
      },
    },
  }) as unknown as OrderWithRelations | null;

  if (!order) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/account-ledger">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Volver
            </Link>
          </Button>
        </div>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Orden no encontrada</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalPaid = order.cashMovements.reduce((sum, pm) => sum + pm.total, 0);
  const remainingBalance = order.total - totalPaid;



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

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/account-ledger">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Volver
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Detalle de Cuenta</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main Info Card */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Orden #{order.id.slice(-6).toUpperCase()}</span>
              {getStatusBadge(order.paidStatus)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Client & Date Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <User className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-medium">Cliente</p>
                  <p className="font-medium">{order.client?.name || "Sin cliente"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-medium">Fecha</p>
                  <p className="font-medium"><LocalDate date={order.date} /></p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Products Table - Editable for unpaid orders */}
            <div>
              <h3 className="font-semibold flex items-center gap-2 mb-4">
                <Package className="h-5 w-5" />
                Productos
              </h3>
              {order.paidStatus === "inpago" ? (
                <EditableOrderDetailWrapper
                  order={order}
                  businessId={session.user.businessId}
                />
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="text-center">Cantidad</TableHead>
                        <TableHead className="text-right">P. Unitario</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {order.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-medium">{item.description || "Producto"}</div>
                            {item.code && (
                              <div className="text-xs text-muted-foreground">{item.code}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-center">{item.quantity}</TableCell>
                          <TableCell className="text-right">
                            ${item.price.toLocaleString("es-AR")}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            ${item.subTotal.toLocaleString("es-AR")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <Separator />

            {/* Payment History */}
            <div>
              <h3 className="font-semibold flex items-center gap-2 mb-4">
                Historial de Pagos
              </h3>
              {order.cashMovements.length === 0 ? (
                <p className="text-muted-foreground text-sm">No hay pagos registrados</p>
              ) : (
                <div className="space-y-2">
                  {order.cashMovements.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-sm">{payment.paidMethod || "Pago"}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-medium text-green-700 dark:text-green-400">
                          +${payment.total.toLocaleString("es-AR")}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          <LocalDate date={payment.date} />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Summary & Actions Card */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-lg">Resumen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Orden</span>
                <span className="font-medium">${order.total.toLocaleString("es-AR")}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pagado</span>
                <span className="font-medium text-green-600">
                  -${totalPaid.toLocaleString("es-AR")}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="font-semibold">Saldo Pendiente</span>
                <span className="text-xl font-bold text-primary">
                  ${remainingBalance.toLocaleString("es-AR")}
                </span>
              </div>
            </div>

            {order.paidStatus !== "pago" && (
              <div className="space-y-2 pt-4">
                <AddPaymentForm 
                  orderId={order.id} 
                  remainingBalance={remainingBalance}
                  businessId={session.user.businessId}
                  showForm={actionParams.action === "payment"}
                />
              </div>
            )}

            {order.paidStatus !== "pago" && (
              <div className="pt-2">
                <CancelOrderButton 
                  orderId={order.id}
                  businessId={session.user.businessId}
                  showButton={actionParams.action === "cancel"}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
