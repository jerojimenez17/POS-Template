import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DollarSign, TrendingUp, ShoppingCart, BarChart3 } from "lucide-react";

interface SearchBillHeaderProps {
  totalSales: number;
  orderCount: number;
  totalToday: number;
  todayCount: number;
}

export default function SearchBillHeader({ totalSales, orderCount, totalToday, todayCount }: SearchBillHeaderProps) {
  const formatCurrency = (value: number) => 
    new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);

  const avgSale = orderCount > 0 ? totalSales / orderCount : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Ventas - Primary */}
      <Card className="bg-blue-50 border-2 border-blue-500">
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <span className="text-blue-700 text-sm font-semibold">Total General</span>
          <DollarSign className="h-5 w-5 text-blue-600" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-black text-blue-900">{formatCurrency(totalSales)}</div>
          <div className="text-blue-600 text-sm font-medium">{orderCount} ventas</div>
        </CardContent>
      </Card>

      {/* Hoy - Secondary */}
      <Card className="bg-emerald-50 border-2 border-emerald-500">
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <span className="text-emerald-700 text-sm font-semibold">Hoy</span>
          <TrendingUp className="h-5 w-5 text-emerald-600" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-black text-emerald-900">{formatCurrency(totalToday)}</div>
          <div className="text-emerald-600 text-sm font-medium">{todayCount} ventas hoy</div>
        </CardContent>
      </Card>

      {/* Promedio */}
      <Card className="bg-slate-50 border-2 border-slate-500">
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <span className="text-slate-700 text-sm font-semibold">Promedio</span>
          <BarChart3 className="h-5 w-5 text-slate-600" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-black text-slate-900">{formatCurrency(avgSale)}</div>
          <div className="text-slate-600 text-sm font-medium">por venta</div>
        </CardContent>
      </Card>

      {/* Ventas Hoy */}
      <Card className="bg-violet-50 border-2 border-violet-500">
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <span className="text-violet-700 text-sm font-semibold">Transacciones</span>
          <ShoppingCart className="h-5 w-5 text-violet-600" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-black text-violet-900">{todayCount}</div>
          <div className="text-violet-600 text-sm font-medium">ventas hoy</div>
        </CardContent>
      </Card>
    </div>
  );
}