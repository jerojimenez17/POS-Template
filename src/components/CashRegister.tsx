"use client";
import React, { useEffect, useState, useMemo } from "react";
import { getMovements } from "@/actions/movements";
import { pusherClient } from "@/lib/pusher-client";
import Movement from "@/models/Movement";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calculator, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import TotalPanel from "@/components/TotalPanel";
import EditButton from "@/components/EditButton";
import AddButton from "@/components/AddButton";

import { Session } from "next-auth";
import { formatLocalDate } from "@/utils/date";
import { cn } from "@/lib/utils";

const ITEMS_PER_PAGE = 25;

interface props {
  session: Session | null;
}

const CashRegister = ({ session }: props) => {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [refreshTotal, setRefreshTotal] = useState(0);
  const [showOnlyCash, setShowOnlyCash] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const fetchMovements = async () => {
      const data = await getMovements();
      const mappedMovements = data.map(m => ({
        ...m,
        date: new Date(m.date),
        paidMethod: m.paidMethod || "",
        seller: m.seller || ""
      }));
       setMovements(mappedMovements);
    };

    fetchMovements();

    if (session?.user?.businessId) {
      const channel = pusherClient.subscribe(`movements-${session.user.businessId}`);

      channel.bind("new-movement", (data: Movement) => {
             const newMovement = {
                 ...data,
                 date: new Date(data.date),
                 paidMethod: data.paidMethod || "",
                 seller: data.seller || ""
             };
             setMovements((prev) => [newMovement, ...prev]);
             setRefreshTotal((prev) => prev + 1);
      });

      return () => {
        pusherClient.unsubscribe(`movements-${session.user.businessId}`);
      };
    }
  }, [session?.user?.businessId]);

  const filteredMovements = useMemo(() => {
    const filtered = movements.filter(m => !showOnlyCash || m.paidMethod === "Efectivo");
    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [movements, showOnlyCash]);

  // Paginate
  const totalPages = Math.ceil(filteredMovements.length / ITEMS_PER_PAGE);
  const paginatedMovements = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredMovements.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredMovements, page]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900 pb-20">
      {/* Header */}
      <header className="p-4 md:p-6 border-b bg-white dark:bg-gray-900 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/" title="Volver">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <Calculator className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Caja</h1>
              <p className="text-sm text-gray-500 hidden sm:block">Gestión de ingresos, retiros y balance diario</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AddButton session={session} onSuccess={() => setRefreshTotal((prev) => prev + 1)} />
          <EditButton session={session} onSuccess={() => setRefreshTotal((prev) => prev + 1)} />
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Balance Panel */}
        <TotalPanel refreshCount={refreshTotal} />

        {/* Movements Table */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
          {/* Table header with filter */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex flex-col sm:flex-row justify-between items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Historial de Movimientos</h2>
            <div className="inline-flex items-center p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg gap-0.5">
              <button
                onClick={() => { setShowOnlyCash(false); setPage(1); }}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 whitespace-nowrap",
                  !showOnlyCash
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                )}
              >
                Ver Todos
              </button>
              <button
                onClick={() => { setShowOnlyCash(true); setPage(1); }}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 whitespace-nowrap",
                  showOnlyCash
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                )}
              >
                Solo Efectivo
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                  <TableHead className="font-semibold text-gray-700 dark:text-gray-200 h-12">Fecha y Hora</TableHead>
                  <TableHead className="font-semibold text-gray-700 dark:text-gray-200 h-12">Usuario</TableHead>
                  <TableHead className="font-semibold text-gray-700 dark:text-gray-200 h-12 text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedMovements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-12 text-muted-foreground">
                      No hay movimientos registrados recientes.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedMovements.map((movement) => {
                    const isNegative = movement.total < 0;
                    const label = movement.paidMethod || "";

                    return (
                      <TableRow
                        key={movement.id}
                        className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                      >
                        <TableCell className="text-sm py-3">
                          <span className="font-medium text-gray-900 dark:text-gray-200">
                            {formatLocalDate(movement.date)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm font-medium text-gray-700 dark:text-gray-300 py-3">
                          {movement.seller?.split('@')[0] || "Sistema"}
                        </TableCell>
                        <TableCell className="text-right py-3">
                          <span
                            className={cn(
                              "inline-flex items-center gap-2 font-semibold",
                              isNegative ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-500"
                            )}
                          >
                            <span className="font-mono">
                              {isNegative ? "- " : "+ "}$
                              {Math.abs(movement.total).toLocaleString("es-AR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                            {label && label !== "Efectivo" && (
                              <span
                                className={cn(
                                  "text-[11px] font-medium px-2 py-0.5 rounded-full",
                                  label === "Retiro"
                                    ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-800"
                                    : label === "Deposito"
                                    ? "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400 border border-green-200 dark:border-green-800"
                                    : "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400 border border-purple-200 dark:border-purple-800"
                                )}
                              >
                                {label}
                              </span>
                            )}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {filteredMovements.length} movimiento{filteredMovements.length !== 1 ? "s" : ""}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-gray-500 dark:text-gray-400 px-2 min-w-[60px] text-center">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CashRegister;
