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
import { CalendarIcon, ChevronLeft, ChevronRight, BarChart3, PackagePlus, PackageMinus } from "lucide-react";
import { format, addDays, subDays, addMonths, subMonths, addYears, subYears, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { es } from "date-fns/locale";
import StockActivityModal, { StockActivityItem } from "./StockActivityModal";
import { pusherClient } from "@/lib/pusher-client";
import { Session } from "next-auth";

export interface PeriodicReportData {
  totalSales: number;
  orderCount: number;
  totalDiscounts: number;
  totalReturns: number;
  returnCount: number;
  netTotal: number;
  paymentMethods: Record<string, number>;
  stockMovementCount: number;
  stockActivity: {
    ins: StockActivityItem[];
    outs: StockActivityItem[];
  };
}

interface PeriodicReportProps {
  period: "daily" | "monthly" | "yearly";
  session?: Session | null;
}

const PeriodicReport: React.FC<PeriodicReportProps> = ({ period, session }) => {
  const [date, setDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<PeriodicReportData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [refreshToggle, setRefreshToggle] = useState(0);

  const fetchReport = async (selectedDate: Date) => {
    setLoading(true);
    
    let startDate = selectedDate;
    let endDate = selectedDate;
    
    if (period === "monthly") {
      startDate = startOfMonth(selectedDate);
      endDate = endOfMonth(selectedDate);
    } else if (period === "yearly") {
      startDate = startOfYear(selectedDate);
      endDate = endOfYear(selectedDate);
    }
    
    const res = await getDailyReportAction(startDate, endDate);
    if (res.success) {
      setReport(res.data as PeriodicReportData);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchReport(date);
  }, [date, period, refreshToggle]);

  useEffect(() => {
    if (session?.user?.businessId) {
      const channelName = `orders-${session.user.businessId}`;
      const channel = pusherClient.subscribe(channelName);
      
      const handleUpdate = () => {
        setRefreshToggle((prev) => prev + 1);
      };

      channel.bind("orders-update", handleUpdate);

      return () => {
        channel.unbind("orders-update", handleUpdate);
      };
    }
  }, [session?.user?.businessId]);

  const handlePrev = () => {
    if (period === "daily") setDate(subDays(date, 1));
    else if (period === "monthly") setDate(subMonths(date, 1));
    else setDate(subYears(date, 1));
  };
  
  const handleNext = () => {
    if (period === "daily") setDate(addDays(date, 1));
    else if (period === "monthly") setDate(addMonths(date, 1));
    else setDate(addYears(date, 1));
  };

  const getFormatString = () => {
    if (period === "daily") return "EEEE, d 'de' MMMM yyyy";
    if (period === "monthly") return "MMMM yyyy";
    return "yyyy";
  };
  
  const disableNext = () => {
    const today = new Date();
    if (period === "daily") return format(date, "yyyy-MM-dd") === format(today, "yyyy-MM-dd");
    if (period === "monthly") return format(date, "yyyy-MM") === format(today, "yyyy-MM");
    return format(date, "yyyy") === format(today, "yyyy");
  };

  if (loading && !report) {
    return <div className="h-full flex px-4 py-8 items-center justify-center"><Spinner /></div>;
  }

  const title = period === "daily" ? "Reporte Diario" : period === "monthly" ? "Reporte Mensual" : "Reporte Anual";
  
  const stockOutsTotal = report?.stockActivity?.outs.reduce((acc, item) => acc + item.quantity, 0) || 0;
  const stockInsTotal = report?.stockActivity?.ins.reduce((acc, item) => acc + item.quantity, 0) || 0;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto border bg-white dark:bg-gray-900 rounded-xl shadow-sm">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">{title}</h2>
        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-1.5 rounded-lg border shadow-sm">
          <Button variant="ghost" size="icon" onClick={handlePrev} className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 px-3 min-w-[140px] justify-center">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm capitalize">
              {format(date, getFormatString(), { locale: es })}
            </span>
          </div>
          <Button variant="ghost" size="icon" onClick={handleNext} disabled={disableNext()} className="h-8 w-8">
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
            <Card className="border-green-100 bg-green-50/30 dark:border-green-900/50 dark:bg-green-900/10">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-green-800 dark:text-green-300">Ventas Totales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  ${report.totalSales.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-green-600/70 dark:text-green-400/70">{report.orderCount} tickets emitidos</p>
              </CardContent>
            </Card>
            <Card className="border-amber-100 bg-amber-50/30 dark:border-amber-900/50 dark:bg-amber-900/10">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-amber-800 dark:text-amber-300">Descuentos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  ${report.totalDiscounts.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-amber-600/70 dark:text-amber-400/70">Promociones aplicadas</p>
              </CardContent>
            </Card>
            <Card className="border-red-100 bg-red-50/30 dark:border-red-900/50 dark:bg-red-900/10">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-red-800 dark:text-red-300">Devoluciones</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  ${report.totalReturns.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-red-600/70 dark:text-red-400/70">{report.returnCount} devoluciones</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Neto en Caja</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                  ${report.netTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground">Ventas - Devoluciones</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="overflow-hidden">
              <CardHeader className="bg-slate-50 dark:bg-slate-800 border-b">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-500" />
                  Canales de Pago
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="px-6 py-3">Método</TableHead>
                      <TableHead className="text-right px-6 py-3">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(report.paymentMethods).map(([method, amount]: [string, number]) => (
                      <TableRow key={method}>
                        <TableCell className="font-medium px-6 py-3 text-slate-600 dark:text-slate-300">{method}</TableCell>
                        <TableCell className="text-right px-6 py-3 font-semibold text-slate-800 dark:text-slate-100">
                          ${amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                    {Object.keys(report.paymentMethods).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground py-6">
                          No hay ventas registradas en caja
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden group cursor-pointer border-blue-100 hover:border-blue-300 dark:border-blue-900 dark:hover:border-blue-700 transition-all" onClick={() => setIsModalOpen(true)}>
              <div className="absolute inset-0 bg-linear-to-br from-blue-50/50 to-transparent dark:from-blue-900/10 pointer-events-none" />
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-blue-500" />
                    Actividad de Stock
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30">
                    Ver Ranking
                  </Button>
                </CardTitle>
                <CardDescription>Mercadería que ingresó y salió del local</CardDescription>
              </CardHeader>
              <CardContent className="pt-4 pb-6">
                 <div className="flex items-center justify-around">
                    <div className="text-center space-y-1">
                       <div className="flex items-center justify-center gap-1.5 text-red-500 mb-2">
                         <PackageMinus className="w-5 h-5" />
                         <span className="text-xs font-semibold uppercase tracking-wider">Egresos</span>
                       </div>
                       <div className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">
                         {stockOutsTotal}
                       </div>
                       <div className="text-[10px] text-slate-400">Unidades vendidas</div>
                    </div>
                    
                    <div className="w-px h-16 bg-slate-200 dark:bg-slate-700" />
                    
                    <div className="text-center space-y-1">
                       <div className="flex items-center justify-center gap-1.5 text-green-500 mb-2">
                         <PackagePlus className="w-5 h-5" />
                         <span className="text-xs font-semibold uppercase tracking-wider">Ingresos</span>
                       </div>
                       <div className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">
                         {stockInsTotal}
                       </div>
                       <div className="text-[10px] text-slate-400">Devoluciones / Ajustes</div>
                    </div>
                 </div>
              </CardContent>
            </Card>
          </div>
          
          <StockActivityModal 
            isOpen={isModalOpen} 
            onClose={() => setIsModalOpen(false)} 
            ins={report.stockActivity.ins} 
            outs={report.stockActivity.outs} 
          />
        </>
      )}
    </div>
  );
};

export default PeriodicReport;
