import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getCashboxSessions, getCashboxes } from "@/actions/cashbox";
import { ArrowLeft, History } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ZReport } from "@/types/cashbox";

export const metadata = {
  title: "Historial de Cajas",
};

export default async function CashboxHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: cashboxId } = await params;
  const session = await auth();

  if (!session || !session.user || session.user.role !== "ADMIN") {
    redirect("/");
  }

  const cashboxesResult = await getCashboxes();
  const cashboxesData: { id: string; name: string; businessId: string; updatedAt: Date; total: number }[] =
    'data' in cashboxesResult && Array.isArray(cashboxesResult.data) ? cashboxesResult.data : [];
  const cashbox = cashboxesData.find((c) => c.id === cashboxId);

  if (!cashbox) {
    redirect("/admin/cashboxes");
  }

  const result = await getCashboxSessions(cashboxId);
  const rawSessions = 'data' in result && Array.isArray(result.data) ? result.data : [];

  const sessions = rawSessions.map((s) => ({
    ...s,
    zReport: s.zReport as ZReport | null,
  }));

  const totalSales = sessions.reduce(
    (acc, s) => acc + (s.zReport?.totalSales ?? 0),
    0
  );
  const totalReturns = sessions.reduce(
    (acc, s) => acc + (s.zReport?.totalReturns ?? 0),
    0
  );
  const sessionCount = sessions.length;

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
    }).format(amount);

  const formatDateTime = (date: Date | null) => {
    if (!date) return "-";
    return format(date, "dd/MM/yyyy HH:mm", { locale: es });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900 pb-20">
      <header className="p-4 md:p-6 border-b bg-white dark:bg-gray-900 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild title="Volver">
            <Link href="/admin/cashboxes">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <History className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Historial - {cashbox.name}</h1>
              <p className="text-sm text-gray-500 hidden sm:block">Sesiones cerradas y reportes Z</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border bg-white dark:bg-gray-900 p-4 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">Sesiones</p>
          <p className="text-2xl font-bold">{sessionCount}</p>
        </div>
        <div className="rounded-lg border bg-green-50 dark:bg-green-900/10 p-4 shadow-sm">
          <p className="text-sm font-medium text-green-700 dark:text-green-300">
            Ventas Totales
          </p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {formatCurrency(totalSales)}
          </p>
        </div>
        <div className="rounded-lg border bg-red-50 dark:bg-red-900/10 p-4 shadow-sm">
          <p className="text-sm font-medium text-red-700 dark:text-red-300">
            Devoluciones
          </p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">
            {formatCurrency(totalReturns)}
          </p>
        </div>
        <div className="rounded-lg border bg-slate-50 dark:bg-slate-800 p-4 shadow-sm">
          <p className="text-sm font-medium">Neto</p>
          <p className="text-2xl font-bold">
            {formatCurrency(totalSales - totalReturns)}
          </p>
        </div>
      </div>

      <div className="rounded-md border bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-gray-800/50">
              <TableHead>Fecha Apertura</TableHead>
              <TableHead>Fecha Cierre</TableHead>
              <TableHead>Saldo Inicial</TableHead>
              <TableHead>Ventas</TableHead>
              <TableHead>Devoluciones</TableHead>
              <TableHead>Neto</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No hay sesiones registradas.
                </TableCell>
              </TableRow>
            ) : (
              sessions.map((s) => (
                <TableRow
                  key={s.id}
                  className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50"
                >
                  <TableCell className="font-medium">
                    {formatDateTime(s.startTime)}
                  </TableCell>
                  <TableCell>{formatDateTime(s.endTime)}</TableCell>
                  <TableCell>{formatCurrency(s.initialBalance)}</TableCell>
                  <TableCell className="text-green-600">
                    {s.zReport
                      ? formatCurrency(s.zReport.totalSales)
                      : "-"}
                  </TableCell>
                  <TableCell className="text-red-500">
                    {s.zReport && s.zReport.returnCount > 0
                      ? formatCurrency(s.zReport.totalReturns)
                      : "-"}
                  </TableCell>
                  <TableCell className="font-semibold">
                    {s.zReport ? formatCurrency(s.zReport.netTotal) : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={s.status === "OPEN" ? "default" : "secondary"}
                      className={
                        s.status === "OPEN"
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : ""
                      }
                    >
                      {s.status === "OPEN" ? "Abierta" : "Cerrada"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
    </div>
  );
}