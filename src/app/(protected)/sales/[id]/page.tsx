import { auth } from "../../../../../auth";
import { getSaleByIdAction } from "@/actions/sales";
import SaleHistory from "@/components/Billing/SaleHistory";
import SaleDetailActions from "@/components/Billing/SaleDetailActions";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Package, User, Calendar, ArrowLeft, Edit2, Calculator, Receipt } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import Spinner from "@/components/ui/Spinner";

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const sale = await getSaleByIdAction(id);

  if (!sale) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] space-y-4">
        <h2 className="text-2xl font-bold">Venta no encontrada</h2>
        <Link href="/searchBill" className="text-blue-500 hover:underline flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Volver a ventas
        </Link>
      </div>
    );
  }

  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl h-full flex flex-col">
      <Link href="/searchBill" className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 flex items-center gap-1 transition-colors w-fit mb-4 text-sm font-medium">
        <ArrowLeft className="h-4 w-4" /> Volver a ventas
      </Link>

      <div className="flex-1 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 md:p-6 overflow-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Venta #{sale.id.slice(-6).toUpperCase()}
            </h1>
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800 px-3 py-1">
              Confirmada
            </Badge>
          </div>
          {isAdmin && (
            <Link href={`/sales/${sale.id}/edit`} className="w-full sm:w-auto bg-blue-600 text-white px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-md hover:shadow-lg active:scale-[0.98] font-semibold text-sm">
              <Edit2 className="h-4 w-4" /> Editar Venta
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Info grid */}
            <section className="bg-card border rounded-xl p-5 shadow-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">Fecha</span>
                  <div className="flex items-center gap-2 text-sm font-medium text-card-foreground">
                    <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                    {format(sale.date, "dd/MM/yyyy HH:mm")}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">Vendedor</span>
                  <div className="flex items-center gap-2 text-sm font-medium text-card-foreground">
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    {sale.seller}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">Método de Pago</span>
                  <div className="flex items-center gap-2 text-sm font-medium text-card-foreground capitalize">
                    <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />
                    {sale.twoMethods ? `${sale.paidMethod} + ${sale.secondPaidMethod}` : sale.paidMethod}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">Cliente</span>
                  <div className="flex items-center gap-2 text-sm font-medium text-card-foreground">
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    {sale.client || "Consumidor Final"}
                    {sale.clientIvaCondition && sale.clientIvaCondition !== "Consumidor Final" && (
                      <span className="text-xs text-muted-foreground/60 font-mono ml-1">
                        ({sale.clientIvaCondition}: {sale.clientDocumentNumber})
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Products */}
            <section className="bg-card border rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-card-foreground flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  Productos
                </h3>
                <Badge variant="secondary" className="font-mono text-xs">
                  {sale.products.length} items
                </Badge>
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="pb-3 font-semibold text-xs uppercase tracking-wide">Descripción</th>
                      <th className="pb-3 font-semibold text-center text-xs uppercase tracking-wide">Cantidad</th>
                      <th className="pb-3 font-semibold text-right text-xs uppercase tracking-wide">P. Unitario</th>
                      <th className="pb-3 font-semibold text-right text-xs uppercase tracking-wide">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sale.products.map((product, idx) => (
                      <tr key={idx} className="hover:bg-accent/30 transition-colors">
                        <td className="py-3 pr-4">
                          <div className="font-medium text-card-foreground">{product.description}</div>
                          <div className="text-xs text-muted-foreground font-mono">{product.code}</div>
                        </td>
                        <td className="py-3 text-center font-medium">{product.amount}</td>
                        <td className="py-3 text-right text-muted-foreground">
                          ${product.salePrice?.toLocaleString("es-AR")}
                        </td>
                        <td className="py-3 text-right font-bold text-card-foreground">
                          ${((product.salePrice || 0) * product.amount).toLocaleString("es-AR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-3">
                {sale.products.map((product, idx) => (
                  <div key={idx} className="bg-accent/30 p-4 rounded-xl border border-border space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="space-y-1">
                        <div className="font-bold text-card-foreground leading-tight">{product.description}</div>
                        <div className="text-[10px] text-muted-foreground font-mono tracking-wider uppercase">{product.code}</div>
                      </div>
                      <Badge variant="outline" className="shrink-0">
                        x{product.amount}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-end pt-2 border-t border-border/50">
                      <div className="text-xs text-muted-foreground">
                        P. Unit: ${product.salePrice?.toLocaleString("es-AR")}
                      </div>
                      <div className="font-black text-card-foreground">
                        ${((product.salePrice || 0) * product.amount).toLocaleString("es-AR")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Totals Summary */}
          <div className="space-y-6">
            <section className="bg-card border rounded-xl p-5 shadow-sm h-fit">
              <h3 className="text-sm font-semibold text-card-foreground mb-4 flex items-center gap-2">
                <Calculator className="h-4 w-4 text-muted-foreground" />
                Resumen
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold text-card-foreground">${sale.total.toLocaleString("es-AR")}</span>
                </div>
                {sale.discount > 0 && (
                  <div className="flex justify-between text-sm text-orange-600 dark:text-orange-400 font-medium">
                    <span>Descuento ({sale.discount}%)</span>
                    <span>-${(sale.total - sale.totalWithDiscount!).toLocaleString("es-AR")}</span>
                  </div>
                )}
              </div>

              <Separator className="my-4" />

              <div className="flex justify-between items-end">
                <span className="text-sm font-bold text-muted-foreground uppercase">Total final</span>
                <span className="text-2xl font-black text-primary tracking-tighter">
                  ${sale.totalWithDiscount?.toLocaleString("es-AR")}
                </span>
              </div>

              {sale.twoMethods && (
                <>
                  <Separator className="my-4" />
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Desglose de Pago</span>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center text-muted-foreground p-2 bg-accent/30 rounded-lg">
                        <span className="font-medium">{sale.paidMethod}</span>
                        <span className="font-bold text-card-foreground">${((sale.totalWithDiscount || 0) - (sale.totalSecondMethod || 0)).toLocaleString("es-AR")}</span>
                      </div>
                      <div className="flex justify-between items-center text-muted-foreground p-2 bg-accent/30 rounded-lg">
                        <span className="font-medium">{sale.secondPaidMethod}</span>
                        <span className="font-bold text-card-foreground">${(sale.totalSecondMethod || 0).toLocaleString("es-AR")}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </section>

            <SaleDetailActions sale={sale} session={session} />
          </div>
        </div>
      </div>

      {/* History Section */}
      <div className="mt-8 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 md:p-6">
        <Suspense fallback={<div className="flex justify-center py-8"><Spinner /></div>}>
          <SaleHistory saleId={sale.id} />
        </Suspense>
      </div>
    </div>
  );
}
