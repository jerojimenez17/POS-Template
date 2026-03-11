import { auth } from "../../../../../auth";
import { getSaleByIdAction } from "@/actions/sales";
import SaleHistory from "@/components/Billing/SaleHistory";
import moment from "moment";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Package, User, CreditCard, Calendar, ArrowLeft, Edit2 } from "lucide-react";
import Link from "next/link";

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
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8 pb-20">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <Link href="/searchBill" className="text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors text-sm font-medium">
          <ArrowLeft className="h-4 w-4" /> Volver a ventas
        </Link>
        {isAdmin && (
          <Link href={`/sales/${sale.id}/edit`} className="w-full sm:w-auto bg-blue-600 text-white px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-md hover:shadow-lg active:scale-[0.98] font-semibold text-sm">
            <Edit2 className="h-4 w-4" /> Editar Venta
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main Info Card */}
        <Card className="md:col-span-2 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xl font-bold">Venta #{sale.id.slice(-6).toUpperCase()}</CardTitle>
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 px-3 py-1">Confirmada</Badge>
          </CardHeader>
          <CardContent className="space-y-6 p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-4">
              <div className="space-y-1">
                <span className="text-xs text-slate-500 uppercase font-semibold">Fecha</span>
                <div className="flex items-center gap-2 text-slate-700 font-medium">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  {moment(sale.date).format("DD/MM/YYYY HH:mm")}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-slate-500 uppercase font-semibold">Vendedor</span>
                <div className="flex items-center gap-2 text-slate-700 font-medium">
                  <User className="h-4 w-4 text-slate-400" />
                  {sale.seller}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-slate-500 uppercase font-semibold">Metodo de Pago</span>
                <div className="flex items-center gap-2 text-slate-700 font-medium capitalize">
                  <CreditCard className="h-4 w-4 text-slate-400" />
                  {sale.twoMethods ? `${sale.paidMethod} + ${sale.secondPaidMethod}` : sale.paidMethod}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-slate-500 uppercase font-semibold">Cliente</span>
                <div className="flex items-center gap-2 text-slate-700 font-medium">
                  <Package className="h-4 w-4 text-slate-400" />
                  {sale.client || "Consumidor Final"}
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Package className="h-5 w-5 text-blue-500" />
                  Productos
                </h3>
                <Badge variant="secondary" className="font-mono text-xs">
                  {sale.products.length} items
                </Badge>
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block bg-slate-50 dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-100 dark:border-slate-800">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-100/50 dark:bg-slate-800/50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Descripción</th>
                      <th className="px-4 py-3 font-semibold text-center">Cantidad</th>
                      <th className="px-4 py-3 font-semibold text-right">P. Unitario</th>
                      <th className="px-4 py-3 font-semibold text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {sale.products.map((product, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 dark:text-white">{product.description}</div>
                          <div className="text-xs text-slate-400 font-mono">{product.code}</div>
                        </td>
                        <td className="px-4 py-3 text-center font-medium">{product.amount}</td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">
                          ${product.salePrice?.toLocaleString("es-AR")}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">
                          ${((product.salePrice || 0) * product.amount).toLocaleString("es-AR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-3">
                {sale.products.map((product, idx) => (
                  <div key={idx} className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="space-y-1">
                        <div className="font-bold text-slate-900 dark:text-white leading-tight">{product.description}</div>
                        <div className="text-[10px] text-slate-400 font-mono tracking-wider uppercase">{product.code}</div>
                      </div>
                      <Badge variant="outline" className="shrink-0 bg-white dark:bg-slate-800">
                        x{product.amount}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-end pt-2 border-t border-slate-200/50 dark:border-slate-800/50">
                      <div className="text-xs text-slate-500">
                        P. Unit: ${product.salePrice?.toLocaleString("es-AR")}
                      </div>
                      <div className="font-black text-slate-900 dark:text-white">
                        ${((product.salePrice || 0) * product.amount).toLocaleString("es-AR")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Totals Summary Card */}
        <Card className="shadow-sm h-fit overflow-hidden border-slate-200/60 dark:border-slate-800/60">
          <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 p-4 sm:p-6">
            <CardTitle className="text-lg font-bold text-slate-800 dark:text-slate-100 uppercase tracking-tight">Resumen</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-900 dark:text-white">${sale.total.toLocaleString("es-AR")}</span>
              </div>
              {sale.discount > 0 && (
                <div className="flex justify-between text-sm text-green-600 dark:text-green-500 font-medium">
                  <span>Descuento ({sale.discount}%)</span>
                  <span>-${(sale.total - sale.totalWithDiscount!).toLocaleString("es-AR")}</span>
                </div>
              )}
            </div>
            
            <Separator className="bg-slate-100 dark:bg-slate-800" />
            
            <div className="flex justify-between items-end py-2">
              <span className="text-sm font-bold text-slate-500 uppercase">Total Venta</span>
              <span className="text-3xl font-black text-blue-600 dark:text-blue-400 tracking-tighter">
                ${sale.totalWithDiscount?.toLocaleString("es-AR")}
              </span>
            </div>
            
            {sale.twoMethods && (
              <>
                <Separator className="bg-slate-100 dark:bg-slate-800" />
                <div className="space-y-2 pt-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Desglose de Pago</span>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-400 p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                      <span className="font-medium">{sale.paidMethod}</span>
                      <span className="font-bold text-slate-900 dark:text-white">${((sale.totalWithDiscount || 0) - (sale.totalSecondMethod || 0)).toLocaleString("es-AR")}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-400 p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                      <span className="font-medium">{sale.secondPaidMethod}</span>
                      <span className="font-bold text-slate-900 dark:text-white">${(sale.totalSecondMethod || 0).toLocaleString("es-AR")}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* History Section */}
      <SaleHistory saleId={sale.id} />
    </div>
  );
}
