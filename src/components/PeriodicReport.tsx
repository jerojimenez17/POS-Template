"use client";

import React, { useEffect, useState } from "react";
import { getDailyReportAction } from "@/actions/sales";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "./ui/button";
import { CalendarIcon, ChevronLeft, ChevronRight, BarChart3, PackagePlus, PackageMinus, Search, RefreshCw } from "lucide-react";
import { format, addDays, subDays, addMonths, subMonths, addYears, subYears, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { es } from "date-fns/locale";
import StockActivityModal, { StockActivityItem } from "./StockActivityModal";
import { pusherClient } from "@/lib/pusher-client";
import { Session } from "next-auth";
import { useRouter } from "next/navigation";

export interface PeriodicReportData {
  totalSales: number;
  orderCount: number;
  totalDiscounts: number;
  totalReturns: number;
  returnCount: number;
  netTotal: number;
  paymentMethods: Record<string, number>;
  stockMovementCount: number;
  stockActivity: { ins: StockActivityItem[]; outs: StockActivityItem[] };
}

type ReportPeriod = "daily" | "monthly" | "yearly";

interface PeriodicReportProps {
  period: ReportPeriod;
  session?: Session | null;
}

export function getReportRange(period: ReportPeriod, selectedDate: Date) {
  if (period === "monthly") return { startDate: startOfMonth(selectedDate), endDate: endOfMonth(selectedDate) };
  if (period === "yearly") return { startDate: startOfYear(selectedDate), endDate: endOfYear(selectedDate) };
  return { startDate: selectedDate, endDate: selectedDate };
}

const periodTitle: Record<ReportPeriod, string> = {
  daily: "Reporte Diario",
  monthly: "Reporte Mensual",
  yearly: "Reporte Anual",
};

const periodFormat: Record<ReportPeriod, string> = {
  daily: "EEEE, d 'de' MMMM yyyy",
  monthly: "MMMM yyyy",
  yearly: "yyyy",
};

const money = (value: number) => `$${value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PeriodicReport: React.FC<PeriodicReportProps> = ({ period, session }) => {
  const router = useRouter();
  const [date, setDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<PeriodicReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [refreshToggle, setRefreshToggle] = useState(0);

  useEffect(() => {
    let active = true;
    const { startDate, endDate } = getReportRange(period, date);

    /* eslint-disable react-hooks/set-state-in-effect -- clear the previous range before its replacement loads. */
    setLoading(true);
    setError(null);
    setReport(null);
    /* eslint-enable react-hooks/set-state-in-effect */

    void getDailyReportAction(startDate, endDate)
      .then((res) => {
        if (!active) return;
        if (res.success) {
          setReport(res.data as PeriodicReportData);
          return;
        }
        setError(res.error ?? "No se pudo cargar el reporte");
      })
      .catch(() => {
        if (active) setError("No se pudo cargar el reporte");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [date, period, refreshToggle]);

  useEffect(() => {
    if (!session?.user?.businessId) return;
    const channel = pusherClient.subscribe(`orders-${session.user.businessId}`);
    const handleUpdate = () => setRefreshToggle((previous) => previous + 1);
    channel.bind("orders-update", handleUpdate);
    return () => {
      channel.unbind("orders-update", handleUpdate);
    };
  }, [session?.user?.businessId]);

  const shiftDate = (direction: "previous" | "next") => {
    const amount = direction === "previous" ? -1 : 1;
    if (period === "daily") setDate((previous) => (amount < 0 ? subDays(previous, 1) : addDays(previous, 1)));
    else if (period === "monthly") setDate((previous) => (amount < 0 ? subMonths(previous, 1) : addMonths(previous, 1)));
    else setDate((previous) => (amount < 0 ? subYears(previous, 1) : addYears(previous, 1)));
  };

  const isNextDisabled = () => {
    const today = new Date();
    if (period === "daily") return format(date, "yyyy-MM-dd") === format(today, "yyyy-MM-dd");
    if (period === "monthly") return format(date, "yyyy-MM") === format(today, "yyyy-MM");
    return format(date, "yyyy") === format(today, "yyyy");
  };

  const openSales = () => {
    const { startDate, endDate } = getReportRange(period, date);
    const params = new URLSearchParams({
      report: period,
      from: format(startDate, "yyyy-MM-dd"),
      to: format(endDate, "yyyy-MM-dd"),
      showAll: "true",
    });
    router.push(`/searchBill?${params.toString()}`);
  };

  const retry = () => setRefreshToggle((previous) => previous + 1);
  const stockOutsTotal = report?.stockActivity?.outs.reduce((total, item) => total + item.quantity, 0) ?? 0;
  const stockInsTotal = report?.stockActivity?.ins.reduce((total, item) => total + item.quantity, 0) ?? 0;

  return (
    <section aria-labelledby={`${period}-report-title`} className="mx-auto w-full max-w-5xl space-y-4 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm md:space-y-6 md:p-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <h2 id={`${period}-report-title`} className="text-xl font-bold tracking-tight md:text-2xl">{periodTitle[period]}</h2>
        <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div aria-label={`Navegar por período del reporte ${periodTitle[period]}`} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 p-1.5 sm:justify-start">
            <Button variant="ghost" size="icon" aria-label={`${period === "daily" ? "Día" : period === "monthly" ? "Mes" : "Año"} anterior`} onClick={() => shiftDate("previous")} className="h-9 w-9 shrink-0">
              <ChevronLeft aria-hidden="true" />
            </Button>
            <div className="flex min-w-0 items-center justify-center gap-2 px-2 sm:min-w-[140px]">
              <CalendarIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm font-medium capitalize">{format(date, periodFormat[period], { locale: es })}</span>
            </div>
            <Button variant="ghost" size="icon" aria-label={`${period === "daily" ? "Día" : period === "monthly" ? "Mes" : "Año"} siguiente`} onClick={() => shiftDate("next")} disabled={isNextDisabled()} className="h-9 w-9 shrink-0">
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
          <Button size="sm" onClick={openSales} className="h-12 w-full gap-1.5 bg-primary text-primary-foreground sm:w-auto">
            <Search aria-hidden="true" /> Ver Ventas
          </Button>
        </div>
      </div>

      {loading && (
        <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/30 py-4 text-sm text-muted-foreground">
          <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Cargando reporte…
        </div>
      )}

      {error && !loading && (
        <div role="alert" className="flex flex-col items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive sm:flex-row sm:items-center">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={retry} className="gap-2"><RefreshCw aria-hidden="true" /> Reintentar</Button>
        </div>
      )}

      {!loading && !error && report && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/30"><CardHeader className="space-y-0 pb-2"><CardTitle className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Ventas Totales</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{money(report.totalSales)}</div><p className="text-xs text-emerald-700/80 dark:text-emerald-300/80">{report.orderCount} tickets emitidos</p></CardContent></Card>
            <Card className="border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/30"><CardHeader className="space-y-0 pb-2"><CardTitle className="text-sm font-medium text-amber-800 dark:text-amber-300">Descuentos</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-amber-700 dark:text-amber-300">{money(report.totalDiscounts)}</div><p className="text-xs text-amber-700/80 dark:text-amber-300/80">Promociones aplicadas</p></CardContent></Card>
            <Card className="border-rose-200 bg-rose-50/60 dark:border-rose-900/60 dark:bg-rose-950/30"><CardHeader className="space-y-0 pb-2"><CardTitle className="text-sm font-medium text-rose-800 dark:text-rose-300">Devoluciones</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-rose-700 dark:text-rose-300">{money(report.totalReturns)}</div><p className="text-xs text-rose-700/80 dark:text-rose-300/80">{report.returnCount} devoluciones</p></CardContent></Card>
            <Card className="border-border bg-muted/50"><CardHeader className="space-y-0 pb-2"><CardTitle className="text-sm font-medium">Neto en Caja</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{money(report.netTotal)}</div><p className="text-xs text-muted-foreground">Ventas - Devoluciones</p></CardContent></Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="overflow-hidden"><CardHeader className="border-b border-border bg-muted/40 pb-3"><CardTitle className="flex items-center gap-2 text-base"><BarChart3 aria-hidden="true" className="h-4 w-4 text-primary" /> Canales de Pago</CardTitle></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead className="px-4 py-3">Método</TableHead><TableHead className="px-4 py-3 text-right">Monto</TableHead></TableRow></TableHeader><TableBody>{Object.entries(report.paymentMethods).map(([method, amount]) => <TableRow key={method}><TableCell className="px-4 py-3 font-medium">{method}</TableCell><TableCell className="px-4 py-3 text-right font-semibold">{money(amount)}</TableCell></TableRow>)}{Object.keys(report.paymentMethods).length === 0 && <TableRow><TableCell colSpan={2} className="py-6 text-center text-muted-foreground">No hay ventas registradas en caja</TableCell></TableRow>}</TableBody></Table></CardContent></Card>

            <button type="button" aria-label="Ver ranking de actividad de stock" onClick={() => setIsModalOpen(true)} className="rounded-xl border border-border bg-card text-left shadow-sm outline-none hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring">
              <div className="border-b border-border bg-muted/40 px-6 py-4"><div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-base font-semibold"><BarChart3 aria-hidden="true" className="h-4 w-4 text-primary" /> Actividad de Stock</span><span className="text-xs font-medium text-primary">Ver Ranking</span></div><p className="mt-1 text-sm text-muted-foreground">Mercadería que ingresó y salió del local</p></div>
              <div className="flex items-center justify-around p-5"><div className="space-y-1 text-center"><div className="mb-2 flex items-center justify-center gap-1.5 text-rose-600 dark:text-rose-400"><PackageMinus aria-hidden="true" className="h-5 w-5" /><span className="text-xs font-semibold uppercase tracking-wider">Egresos</span></div><div className="text-3xl font-extrabold">{stockOutsTotal}</div><div className="text-xs text-muted-foreground">Unidades vendidas</div></div><div className="h-16 w-px bg-border" /><div className="space-y-1 text-center"><div className="mb-2 flex items-center justify-center gap-1.5 text-emerald-600 dark:text-emerald-400"><PackagePlus aria-hidden="true" className="h-5 w-5" /><span className="text-xs font-semibold uppercase tracking-wider">Ingresos</span></div><div className="text-3xl font-extrabold">{stockInsTotal}</div><div className="text-xs text-muted-foreground">Devoluciones / Ajustes</div></div></div>
            </button>
          </div>
          <StockActivityModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} ins={report.stockActivity.ins} outs={report.stockActivity.outs} />
        </>
      )}

      {!loading && !error && !report && <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No hay datos para este período.</p>}
    </section>
  );
};

export default PeriodicReport;
