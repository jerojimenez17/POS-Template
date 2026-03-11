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
      <div className="flex items-center justify-between">
        <Link href="/searchBill" className="text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>
        {isAdmin && (
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-sm font-medium">
            <Edit2 className="h-4 w-4" /> Editar Venta
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main Info Card */}
        <Card className="md:col-span-2 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xl font-bold">Venta #{sale.id.slice(-6).toUpperCase()}</CardTitle>
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 px-3 py-1">Confirmada</Badge>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
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
              <h3 className="font-semibold text-slate-900">Productos</h3>
              <div className="bg-slate-50 dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-100 dark:border-slate-800">
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
            </div>
          </CardContent>
        </Card>

        {/* Totals Summary Card */}
        <Card className="shadow-sm h-fit">
          <CardHeader>
            <CardTitle className="text-lg">Resumen de Totales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="font-medium">${sale.total.toLocaleString("es-AR")}</span>
            </div>
            {sale.discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Descuento ({sale.discount}%)</span>
                <span className="font-medium">-${(sale.total - sale.totalWithDiscount!).toLocaleString("es-AR")}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between items-end">
              <span className="text-lg font-bold">Total</span>
              <span className="text-2xl font-black text-blue-600 dark:text-blue-400">
                ${sale.totalWithDiscount?.toLocaleString("es-AR")}
              </span>
            </div>
            
            <Separator />
            
            {sale.twoMethods && (
                <div className="space-y-2 text-xs text-slate-500">
                    <div className="flex justify-between">
                        <span>{sale.paidMethod}</span>
                        <span>${((sale.totalWithDiscount || 0) - (sale.totalSecondMethod || 0)).toLocaleString("es-AR")}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>{sale.secondPaidMethod}</span>
                        <span>${(sale.totalSecondMethod || 0).toLocaleString("es-AR")}</span>
                    </div>
                </div>
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
