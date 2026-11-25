"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getFilteredMovements } from "@/actions/movements";
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
import TotalPanel from "@/components/TotalPanel";
import EditButton from "@/components/EditButton";
import AddButton from "@/components/AddButton";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Session } from "next-auth";
import { formatLocalDate } from "@/utils/date";

interface Props {
  session: Session | null;
}

interface MovementFilters {
  fromDate: string;
  toDate: string;
  paymentMethod: "CASH" | "ALL";
}

type FilteredMovementsResult = Awaited<ReturnType<typeof getFilteredMovements>>;
type MovementRow = Extract<FilteredMovementsResult, { success: true }>["movements"][number];

const initialFilters: MovementFilters = {
  fromDate: "",
  toDate: "",
  paymentMethod: "CASH",
};

const isValidDate = (value: string): boolean => {
  if (value === "") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const getFilterValidationMessage = (filters: MovementFilters): string => {
  if (!isValidDate(filters.fromDate) || !isValidDate(filters.toDate)) {
    return "Ingresá fechas válidas para filtrar los movimientos.";
  }
  if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
    return "La fecha Desde debe ser anterior o igual a Hasta.";
  }
  return "";
};

const roundMovementToPeso = (amount: number): number => {
  const magnitude = Math.floor(Math.abs(amount) + 0.5);
  return amount < 0 ? -magnitude : magnitude;
};

const formatPesos = (amount: number): string =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

const CashRegister = ({ session }: Props) => {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [hasLoadedMovements, setHasLoadedMovements] = useState(false);
  const [isLoadingMovements, setIsLoadingMovements] = useState(true);
  const [movementError, setMovementError] = useState("");
  const [refreshTotal, setRefreshTotal] = useState(0);
  const [filters, setFilters] = useState<MovementFilters>(initialFilters);
  const latestRequestRef = useRef(0);
  const activeFiltersRef = useRef(filters);
  const requestsRef = useRef(new Map<string, ReturnType<typeof getFilteredMovements>>());
  const businessId = session?.user?.businessId;
  const activeBusinessIdRef = useRef(businessId);
  const validationMessage = getFilterValidationMessage(filters);

  const loadFilteredMovements = useCallback(async (requestedFilters: MovementFilters, forceFresh = false) => {
    const requestId = ++latestRequestRef.current;
    const requestKey = JSON.stringify(requestedFilters);
    setIsLoadingMovements(true);
    setMovementError("");

    let request = forceFresh ? undefined : requestsRef.current.get(requestKey);
    if (!request) {
      request = getFilteredMovements(requestedFilters);
      requestsRef.current.set(requestKey, request);
    }

    try {
      const result = await request;
      if (requestId !== latestRequestRef.current) return;
      if (!result.success) {
        setMovementError(result.error || "No se pudo cargar el historial de movimientos.");
        return;
      }

      const mappedMovements = result.movements.map((movement: MovementRow) => ({
        ...movement,
        date: new Date(movement.date),
        paidMethod: movement.paidMethod || "",
        seller: movement.seller || "",
      }));
      setMovements(mappedMovements);
      setFilteredTotal(result.total);
      setHasLoadedMovements(true);
    } catch {
      if (requestId === latestRequestRef.current) {
        setMovementError("No se pudo cargar el historial de movimientos.");
      }
    } finally {
      if (requestsRef.current.get(requestKey) === request) {
        requestsRef.current.delete(requestKey);
      }
      if (requestId === latestRequestRef.current) setIsLoadingMovements(false);
    }
  }, []);

  useLayoutEffect(() => {
    if (activeBusinessIdRef.current === businessId) return;

    activeBusinessIdRef.current = businessId;
    latestRequestRef.current += 1;
    setMovements([]);
    setFilteredTotal(0);
    setHasLoadedMovements(false);
    setMovementError("");
    setIsLoadingMovements(!validationMessage);

    if (!validationMessage) {
      // Business changes invalidate and replace the scoped read before paint.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadFilteredMovements(filters, true);
    }
  }, [businessId, filters, loadFilteredMovements, validationMessage]);

  useEffect(() => {
    if (validationMessage) return;
    // Initial and filter reads are async synchronization, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFilteredMovements(filters);
  }, [filters, loadFilteredMovements, validationMessage]);

  useEffect(() => {
    if (!businessId) return;

    const channelName = `movements-${businessId}`;
    const channel = pusherClient.subscribe(channelName);
    const listener = () => {
      void loadFilteredMovements(activeFiltersRef.current, true);
      // Preserve the existing balance-panel refresh on live movement events.
      setRefreshTotal((current) => current + 1);
    };
    channel.bind("new-movement", listener);

    return () => {
      if (typeof channel.unbind === "function") {
        channel.unbind("new-movement", listener);
      }
      pusherClient.unsubscribe(channelName);
    };
  }, [businessId, loadFilteredMovements]);

  const sortedMovements = [...movements].sort((left, right) => {
    const dateDifference = new Date(right.date).getTime() - new Date(left.date).getTime();
    return dateDifference || right.id.localeCompare(left.id);
  });

  const updateFilter = <Key extends keyof MovementFilters>(key: Key, value: MovementFilters[Key]) => {
    const nextFilters = { ...activeFiltersRef.current, [key]: value };
    activeFiltersRef.current = nextFilters;
    latestRequestRef.current += 1;
    if (getFilterValidationMessage(nextFilters)) setIsLoadingMovements(false);
    setFilters(nextFilters);
  };

  return (
    <div className="min-h-full flex flex-col bg-slate-50 dark:bg-gray-900 pb-10">
      <div className="w-full bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/" title="Volver" aria-label="Volver al inicio">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Caja Registradora</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Gestión de ingresos, retiros y visualización de balance diario.</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full">
            <AddButton session={session} onSuccess={() => setRefreshTotal((current) => current + 1)} />
            <EditButton session={session} onSuccess={() => setRefreshTotal((current) => current + 1)} />
          </div>
        </div>
      </div>

      <div className="max-w-5xl w-full mx-auto px-6 mt-6 flex flex-col gap-6">
        <TotalPanel refreshCount={refreshTotal} />

        <section
          aria-labelledby="movement-history-heading"
          className="w-full bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex flex-col gap-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h2 id="movement-history-heading" className="text-lg font-semibold text-gray-800 dark:text-gray-200">Historial de Movimientos</h2>
              <fieldset className="flex bg-gray-100 dark:bg-gray-900 p-1 rounded-lg border border-gray-200 dark:border-gray-700">
                <legend className="sr-only">Medio de pago</legend>
                <label className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer focus-within:ring-2 focus-within:ring-blue-500 ${filters.paymentMethod === "CASH" ? "bg-white dark:bg-gray-800 shadow-sm text-blue-600 dark:text-blue-400" : "text-gray-500 hover:text-gray-700 dark:text-gray-400"}`}>
                  <input
                    className="sr-only"
                    type="radio"
                    aria-checked={filters.paymentMethod === "CASH"}
                    name="movement-payment-method"
                    value="CASH"
                    checked={filters.paymentMethod === "CASH"}
                    onChange={() => updateFilter("paymentMethod", "CASH")}
                  />
                  Solo efectivo
                </label>
                <label className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer focus-within:ring-2 focus-within:ring-blue-500 ${filters.paymentMethod === "ALL" ? "bg-white dark:bg-gray-800 shadow-sm text-blue-600 dark:text-blue-400" : "text-gray-500 hover:text-gray-700 dark:text-gray-400"}`}>
                  <input
                    className="sr-only"
                    type="radio"
                    aria-checked={filters.paymentMethod === "ALL"}
                    name="movement-payment-method"
                    value="ALL"
                    checked={filters.paymentMethod === "ALL"}
                    onChange={() => updateFilter("paymentMethod", "ALL")}
                  />
                  Todos los medios de pago
                </label>
              </fieldset>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="movement-from-date" className="text-sm font-medium text-gray-700 dark:text-gray-300">Desde</label>
                  <input
                    id="movement-from-date"
                    type="date"
                    value={filters.fromDate}
                    aria-invalid={Boolean(validationMessage)}
                    aria-describedby={validationMessage ? "movement-filter-validation" : undefined}
                    onChange={(event) => updateFilter("fromDate", event.target.value)}
                    className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="movement-to-date" className="text-sm font-medium text-gray-700 dark:text-gray-300">Hasta</label>
                  <input
                    id="movement-to-date"
                    type="date"
                    value={filters.toDate}
                    aria-invalid={Boolean(validationMessage)}
                    aria-describedby={validationMessage ? "movement-filter-validation" : undefined}
                    onChange={(event) => updateFilter("toDate", event.target.value)}
                    className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  />
                </div>
              </div>
              <div className="sm:text-right">
                <p className="text-sm text-gray-600 dark:text-gray-300">Total de movimientos filtrados (neto)</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {!hasLoadedMovements ? "—" : filteredTotal === 0 ? formatPesos(0) : (
                    movements.some((movement) => roundMovementToPeso(movement.total) === filteredTotal) ? (
                      <>
                        <span>{filteredTotal < 0 ? "-" : ""}$</span>
                        <span>{formatPesos(Math.abs(filteredTotal)).slice(1)}</span>
                      </>
                    ) : formatPesos(filteredTotal)
                  )}
                </p>
              </div>
            </div>
            {validationMessage && (
              <p id="movement-filter-validation" role="alert" className="text-sm text-red-600 dark:text-red-400">
                {validationMessage}
              </p>
            )}
            {isLoadingMovements && (
              <p role="status" aria-live="polite" className="text-sm text-blue-700 dark:text-blue-300">
                Cargando movimientos…
              </p>
            )}
            {movementError && (
              <div role="alert" className="flex flex-col sm:flex-row sm:items-center gap-3 text-sm text-red-700 dark:text-red-300">
                <span>{movementError}</span>
                <button
                  type="button"
                  onClick={() => void loadFilteredMovements(activeFiltersRef.current)}
                  className="w-fit rounded-md border border-red-300 dark:border-red-700 px-3 py-1.5 font-semibold hover:bg-red-50 dark:hover:bg-red-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  Reintentar
                </button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                  <TableHead className="font-semibold text-gray-600 dark:text-gray-300">Fecha y Hora</TableHead>
                  <TableHead className="font-semibold text-gray-600 dark:text-gray-300">Usuario</TableHead>
                  <TableHead className="font-semibold text-gray-600 dark:text-gray-300 text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hasLoadedMovements && !isLoadingMovements && sortedMovements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-gray-500 dark:text-gray-400">
                      No hay movimientos para los filtros seleccionados.
                    </TableCell>
                  </TableRow>
                ) : !hasLoadedMovements && !isLoadingMovements && movementError ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-gray-500 dark:text-gray-400">
                      No se pudo mostrar el historial.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedMovements.map((movement) => {
                    const roundedAmount = roundMovementToPeso(movement.total);
                    const isNegative = roundedAmount < 0;
                    const isDigital = movement.paidMethod && movement.paidMethod !== "Efectivo";

                    return (
                      <TableRow key={movement.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/80 transition-colors">
                        <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                          <span className="font-medium text-gray-900 dark:text-gray-200">
                            {formatLocalDate(movement.date)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {movement.seller?.split("@")[0] || "Sistema"}
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${
                          isNegative ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-500"
                        }`}>
                          <div className="flex flex-col items-end">
                            <div>
                              {roundedAmount === 0 ? "" : isNegative ? "- " : "+ "}
                              {formatPesos(Math.abs(roundedAmount))}
                            </div>
                            {isDigital && (
                              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-sm bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 mt-1">
                                {movement.paidMethod}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CashRegister;
