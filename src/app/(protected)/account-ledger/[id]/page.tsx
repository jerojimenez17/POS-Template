import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Prisma } from "@prisma/client";
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
  BookOpen,
  User,
  Calendar,
  Package,
  CheckCircle,
  Phone,
  Mail,
  MapPin
} from "lucide-react";
import { db } from "@/lib/db";
import AddPaymentForm from "./AddPaymentForm";
import CancelOrderButton from "./CancelOrderButton";
import EditableOrderDetailWrapper from "./EditableOrderDetailWrapper";
import PrintOrderButton from "./PrintOrderButton";
import { LocalDate } from "@/components/ui/LocalDate";
import { PaymentVoucherRowActionClient } from "@/components/account-ledger/PaymentVoucherRowActionClient";
import { PaymentVoucherClientEditDialog, type ClientFiscalData } from "@/components/account-ledger/PaymentVoucherClientEditDialog";
import { toWholePesos } from "@/lib/money";

const orderDetailSelect = {
  id: true,
  date: true,
  total: true,
  discountPercentage: true,
  discountAmount: true,
  seller: true,
  paymentMethod: true,
  clientIvaCondition: true,
  clientDocumentType: true,
  clientDocumentNumber: true,
  status: true,
  paidStatus: true,
  clientId: true,
  notes: true,
  client: {
    select: {
      id: true,
      name: true,
      cellPhone: true,
      email: true,
      address: true,
      cuit: true,
      ivaCondition: true,
      fiscalDocumentType: true,
      fiscalDocumentNumber: true,
    },
  },
  items: {
    select: {
      id: true,
      productId: true,
      description: true,
      code: true,
      price: true,
      quantity: true,
      subTotal: true,
      addedAt: true,
    },
  },
  cashMovements: {
    orderBy: { date: "desc" as const },
    select: {
      id: true,
      date: true,
      total: true,
      paidMethod: true,
      paymentVoucher: {
        select: {
          status: true,
          attempts: {
            where: { status: "FAILED" },
            orderBy: { attemptNumber: "desc" as const },
            take: 1,
            select: { billType: true },
          },
        },
      },
    },
  },
} satisfies Prisma.OrderSelect;

function formatPesos(pesos: number): string {
  return pesos.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export default async function AccountLedgerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ id }, actionParams] = await Promise.all([params, searchParams]);
  const session = await auth();
  
  if (!session?.user?.businessId) {
    redirect("/");
  }
  const businessId = session.user.businessId;

  const [order, business] = await Promise.all([
    db.order.findUnique({
      where: { id, businessId },
      select: orderDetailSelect,
    }),
    db.business.findUnique({
      where: { id: businessId },
      select: { ptoVenta: true },
    }),
  ]);

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

  const configuredPtoVentas = (business?.ptoVenta ?? []).filter((value) => Number.isSafeInteger(value) && value > 0);
  const clientFiscalData: ClientFiscalData | null = order.client ? {
    id: order.client.id,
    name: order.client.name ?? "",
    address: order.client.address ?? "",
    cellPhone: order.client.cellPhone ?? "",
    cuit: order.client.cuit ?? "",
    ivaCondition: order.client.ivaCondition ?? "",
    email: order.client.email ?? "",
    fiscalDocumentType: order.client.fiscalDocumentType === "CUIT" || order.client.fiscalDocumentType === "DNI"
      ? order.client.fiscalDocumentType : null,
    fiscalDocumentNumber: order.client.fiscalDocumentNumber ?? null,
  } : null;

  const orderTotalPesos = toWholePesos(order.total);
  const paymentAmounts = order.cashMovements.map((payment) => ({
    payment,
    pesos: toWholePesos(payment.total),
  }));
  const orderTotalIsValid = orderTotalPesos !== null;
  const paymentAmountsAreValid = paymentAmounts.every(({ pesos }) => pesos !== null);
  let totalPaidPesos: number | null = null;
  if (orderTotalIsValid && paymentAmountsAreValid) {
    let accumulatedPesos = 0;
    let paymentTotalIsSafe = true;
    for (const { pesos } of paymentAmounts) {
      if (pesos === null) {
        paymentTotalIsSafe = false;
        break;
      }
      const nextTotal: number = accumulatedPesos + pesos;
      if (!Number.isSafeInteger(nextTotal)) {
        paymentTotalIsSafe = false;
        break;
      }
      accumulatedPesos = nextTotal;
    }
    totalPaidPesos = paymentTotalIsSafe ? accumulatedPesos : null;
  }
  const remainingCandidate = orderTotalPesos !== null && totalPaidPesos !== null
    ? orderTotalPesos - totalPaidPesos
    : null;
  const balanceIsValid = remainingCandidate !== null
    && Number.isSafeInteger(remainingCandidate)
    && remainingCandidate >= 0;
  const remainingBalancePesos = balanceIsValid ? remainingCandidate : null;
  const remainingBalance = remainingBalancePesos;
  const discountAmountPesos = toWholePesos(order.discountAmount);
  const formatOptionalPesos = (pesos: number | null): string =>
    pesos === null ? "No disponible" : formatPesos(pesos);
  const getStatusBadge = (status: string, paidStatus: string) => {
    if (status === "pendiente") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 border border-orange-200 dark:border-orange-800">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
          Por Confirmar
        </span>
      );
    }
    switch (paidStatus) {
      case "inpago":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-800">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            Pendiente
          </span>
        );
      case "pago":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-200 dark:border-green-800">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Pagado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
            {paidStatus}
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900 pb-20">
      <header className="p-4 md:p-6 border-b bg-white dark:bg-gray-900 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild title="Volver">
            <Link href="/account-ledger">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <BookOpen className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Detalle de Cuenta</h1>
              <p className="text-sm text-gray-500 hidden sm:block">
                Orden #{order.id.slice(-6).toUpperCase()}
              </p>
            </div>
          </div>
        </div>
        {getStatusBadge(order.status, order.paidStatus)}
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main Info Card */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Orden #{order.id.slice(-6).toUpperCase()}</span>
              {getStatusBadge(order.status, order.paidStatus)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Client & Date Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <User className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-medium">Cliente</p>
                  {clientFiscalData ? (
                    <PaymentVoucherClientEditDialog
                      client={clientFiscalData}
                      trigger={<button type="button" className="font-medium underline decoration-dotted underline-offset-4 hover:text-primary">{order.client?.name || "Sin cliente"}</button>}
                    />
                  ) : (
                    <p className="font-medium">{order.client?.name || "Sin cliente"}</p>
                  )}
                  {order.notes && (
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                      {order.notes}
                    </p>
                  )}
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

            {order.status === "pendiente" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {order.client?.cellPhone && (
                  <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                    <Phone className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-medium">Teléfono</p>
                      <p className="font-medium">{order.client.cellPhone}</p>
                    </div>
                  </div>
                )}
                {order.client?.email && (
                  <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-medium">Email</p>
                      <p className="font-medium">{order.client.email}</p>
                    </div>
                  </div>
                )}
                {order.client?.address && (
                  <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                    <MapPin className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-medium">Dirección</p>
                      <p className="font-medium">{order.client.address}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

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
                  businessId={businessId}
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
                  {paymentAmounts.map(({ payment, pesos }) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between gap-3 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-sm">{payment.paidMethod || "Pago"}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-medium text-green-700 dark:text-green-400">
                          {pesos === null ? "Monto no disponible" : `+$${formatPesos(pesos)}`}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          <LocalDate date={payment.date} />
                        </span>
                      </div>
                      {pesos !== null && (
                        <PaymentVoucherRowActionClient
                          cashMovementId={payment.id}
                          amount={pesos}
                          status={payment.paymentVoucher?.status ?? "MISSING"}
                          proposedBillType={payment.paymentVoucher?.status === "FAILED"
                            ? payment.paymentVoucher.attempts[0]?.billType
                            : undefined}
                          configuredPtoVentas={configuredPtoVentas}
                        />
                      )}
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
                <span className="font-medium">${formatOptionalPesos(orderTotalIsValid ? orderTotalPesos : null)}</span>
              </div>
              {order.discountPercentage > 0 ? (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Descuento ({order.discountPercentage}%)</span>
                  <span className="font-medium text-red-600">
                    {discountAmountPesos === null
                      ? "No disponible"
                      : `-$${formatPesos(discountAmountPesos)}`}
                  </span>
                </div>
              ) : (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Descuento: 0%</span>
                  <span className="font-medium text-muted-foreground">$0</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pagado</span>
                <span className="font-medium text-green-600">
                  -${formatOptionalPesos(totalPaidPesos)}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="font-semibold">Saldo Pendiente</span>
                <span className="text-xl font-bold text-primary">
                  ${formatOptionalPesos(remainingBalancePesos)}
                </span>
              </div>
            </div>

            {!balanceIsValid && (
              <p role="alert" className="text-sm text-destructive">
                El saldo de esta cuenta contiene importes inválidos. Solicite que revisen y corrijan los datos del libro antes de registrar un pago.
              </p>
            )}

            {order.paidStatus !== "pago" && balanceIsValid && remainingBalance !== null && remainingBalance > 0 && (
              <div className="space-y-2 pt-4">
                <AddPaymentForm 
                  orderId={order.id} 
                  remainingBalance={remainingBalance}
                  businessId={businessId}
                  configuredPtoVentas={configuredPtoVentas}
                  showForm={actionParams.action === "payment"}
                />
              </div>
            )}

            {order.paidStatus !== "pago" && (
              <div className="pt-2">
                <CancelOrderButton 
                  orderId={order.id}
                  businessId={businessId}
                  showButton={actionParams.action === "cancel"}
                />
              </div>
            )}
            {order.paidStatus !== "pago" && (
              <div className="pt-2">
                <PrintOrderButton
                  order={{ ...order, paidMethod: order.paymentMethod }}
                  session={session}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}
