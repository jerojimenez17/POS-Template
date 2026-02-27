"use client";

import React, { useEffect, useState } from "react";
import { getDailyReportAction } from "@/actions/sales";
import {
  Card,
  CardContent,
  CardDescription,
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
import Spinner from "./ui/Spinner";
import { Button } from "./ui/button";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import { es } from "date-fns/locale";

export interface DailyReportData {
  totalSales: number;
  orderCount: number;
  totalDiscounts: number;
  totalReturns: number;
  returnCount: number;
  netTotal: number;
  paymentMethods: Record<string, number>;
  stockMovementCount: number;
}


const DailyReport = () => {
  const [date, setDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<DailyReportData | null>(null);

  const fetchReport = async (selectedDate: Date) => {
    setLoading(true);
    const res = await getDailyReportAction(selectedDate);
    if (res.success) {
      setReport(res.data as DailyReportData);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchReport(date);
  }, [date]);

  const handlePrevDay = () => setDate(subDays(date, 1));
  const handleNextDay = () => setDate(addDays(date, 1));

  if (loading && !report) {
    return <div className="h-full flex items-center justify-center"><Spinner /></div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto overflow-auto h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Reporte Diario</h1>
        <div className="flex items-center gap-2 bg-white p-2 rounded-lg border shadow-sm">
          <Button variant="ghost" size="icon" onClick={handlePrevDay}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 px-2">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">
              {format(date, "EEEE, d 'de' MMMM", { locale: es })}
            </span>
          </div>
          <Button variant="ghost" size="icon" onClick={handleNextDay} disabled={format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      )}

      {report && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Ventas Totales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  ${report.totalSales.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground">{report.orderCount} tickets emitidos</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Descuentos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600">
                  ${report.totalDiscounts.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground">Promociones aplicadas</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Devoluciones</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  ${report.totalReturns.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground">{report.returnCount} devoluciones procesadas</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-50 border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Neto en Caja</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${report.netTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground">Ventas - Devoluciones</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Canales de Pago</CardTitle>
                <CardDescription>Resumen por medio de pago</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Método</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(report.paymentMethods).map(([method, amount]: [string, number]) => (
                      <TableRow key={method}>
                        <TableCell className="font-medium">{method}</TableCell>
                        <TableCell className="text-right">
                          ${amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                    {Object.keys(report.paymentMethods).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground py-4">
                          No hay ventas registradas
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Actividad de Stock</CardTitle>
                <CardDescription>Movimientos de mercadería</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-center p-6">
                 <div className="text-center space-y-2">
                    <div className="text-4xl font-extrabold text-blue-600">{report.stockMovementCount}</div>
                    <div className="text-sm font-medium text-slate-500 uppercase tracking-wider">Movimientos Registrados</div>
                    <p className="text-xs text-slate-400">Incluye ventas, devoluciones y ajustes.</p>
                 </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default DailyReport;
