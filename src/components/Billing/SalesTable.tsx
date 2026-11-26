"use client";
import React, { useContext, useEffect, useRef, useState } from "react";
import BillState from "@/models/BillState";
import SaleAccordion from "./SaleAccordion";
import { FiltersContext } from "@/context/FiltersContext/FiltersContext";
import PrintableTable from "./PrintableTable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./../ui/select";
import { Button } from "./../ui/button";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { pusherClient } from "@/lib/pusher-client";
import { getSalesAction } from "@/actions/sales/get-sales";
import { isAFIPAuthorized } from "@/lib/utils/bill-type";

import { Session } from "next-auth";
import type { SalesQueryInput } from "@/schemas/sales-query";

const EMPTY_SALES_QUERY: SalesQueryInput = {};

interface props {
  sales: BillState[];
  nextCursor: string | null;
  session: Session | null;
  qzTrayEnabled?: boolean;
  salesQuery?: SalesQueryInput;
  emptyState?: string;
}

const dedupe = (items: BillState[]): BillState[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

const SalesTable = ({
  sales = [],
  nextCursor: initialCursor,
  session,
  qzTrayEnabled = false,
  salesQuery = EMPTY_SALES_QUERY,
  emptyState,
}: props) => {
  const user = session?.user;
  const [printTrigger, setPrintTrigger] = useState(0);
  const [externalState] = useState<BillState>();

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [liveSales, setLiveSales] = useState<BillState[]>(sales);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [hasMore, setHasMore] = useState(initialCursor !== null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshError, setRefreshError] = useState<string>();
  const requestVersion = useRef(0);

  const { filtersState, seller } = useContext(FiltersContext);
  const filterSnapshot = React.useMemo(() => JSON.stringify(filtersState), [filtersState]);
  const snapshotRef = React.useRef(filterSnapshot);
  const initialQueryRef = React.useRef(false);
  const requestRef = React.useRef(0);
  useEffect(() => {
    const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

    if (!isAdmin && user?.email) {
      seller(user.email);
    }
  }, [user?.email, user?.role, seller]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // The live list is local state because it is also updated by the Pusher subscription.
    requestRef.current += 1;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingMore(false);
    setLiveSales(sales);
    setCursor(initialCursor);
    setHasMore(initialCursor !== null);
    setCurrentPage(1);
    requestVersion.current += 1;
    setRefreshError(undefined);
  }, [sales, initialCursor]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (session?.user?.businessId) {
      const channelName = `orders-${session.user.businessId}`;
      const channel = pusherClient.subscribe(channelName);
      
       const handleUpdate = async () => {
        // A live refresh replaces the dataset, so invalidate any in-flight
        // pagination request before applying the refreshed result.
        const requestId = ++requestRef.current;
        setLoadingMore(false);
        const version = ++requestVersion.current;
         try {
           const result = await getSalesAction(salesQuery);
           if (requestId !== requestRef.current) return;
           if (version !== requestVersion.current) return;
           if (result.error) {
             setRefreshError(result.error);
             return;
           }
           setLiveSales(dedupe(result.sales));
           setCursor(result.nextCursor);
           setHasMore(result.nextCursor !== null);
           setRefreshError(undefined);
         } catch (error: unknown) {
           console.error("Sales query failed", { phase: "live-refresh", name: error instanceof Error ? error.name : "UnknownError" });
           if (requestId === requestRef.current && version === requestVersion.current) {
             setRefreshError("No se pudieron cargar las ventas");
           }
         }
      };

      channel.bind("orders-update", handleUpdate);

      return () => {
        requestVersion.current += 1;
        channel.unbind("orders-update", handleUpdate);
      };
    }
  }, [session?.user?.businessId, salesQuery]);

  useEffect(() => {
    // The page intentionally does not provide server-rendered sales. The
    // initial request must be made here, after FiltersContext is available,
    // rather than reusing an unfiltered server response.
    const requiresSellerScope = Boolean(user?.email && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN");
    const sellerScopeReady = !requiresSellerScope || user?.email;
    const needsInitialQuery = !initialQueryRef.current && sales.length === 0 && initialCursor === null && sellerScopeReady;
    if (!needsInitialQuery && snapshotRef.current === filterSnapshot) return;
    initialQueryRef.current = true;
    snapshotRef.current = filterSnapshot;
    const requestId = ++requestRef.current;
    setLoadingMore(false);
    setCurrentPage(1);
    void getSalesAction(salesQuery).then((result) => {
      if (requestId !== requestRef.current) return;
      if (result.error) { setRefreshError(result.error); return; }
      setLiveSales(dedupe(result.sales));
      setCursor(result.nextCursor);
      setHasMore(result.nextCursor !== null);
    }).catch((error: unknown) => {
      console.error("Sales query failed", { phase: "filtered-refresh", name: error instanceof Error ? error.name : "UnknownError" });
      if (requestId === requestRef.current) setRefreshError("No se pudieron cargar las ventas");
    });
    return () => { requestRef.current += 1; };
  }, [filterSnapshot, salesQuery, initialCursor, sales.length, user?.email, user?.role]);

  const handleLoadMore = async () => {
    if (!cursor || loadingMore) return;
    const requestId = ++requestRef.current;
    setLoadingMore(true);
    try {
      const result = await getSalesAction({ ...salesQuery, cursor });
      if (requestId !== requestRef.current) return;
      if (result.error) {
        setRefreshError(result.error);
        return;
      }
      if (result.sales.length > 0) {
        setLiveSales((prev) => dedupe([...prev, ...result.sales]));
        setCursor(result.nextCursor);
        setHasMore(result.nextCursor !== null);
      } else {
        setHasMore(false);
      }
      setRefreshError(undefined);
    } catch (error) {
      console.error("Sales query failed", { phase: "load-more", name: error instanceof Error ? error.name : "UnknownError" });
      if (requestId === requestRef.current) setRefreshError("No se pudieron cargar las ventas");
    } finally {
      if (requestId === requestRef.current) setLoadingMore(false);
    }
  };

  const filteredSales = React.useMemo(() => {
    return liveSales
      .filter((sale) => {
        const { Remito, FacturaC } = filtersState;
        const isFacturaC = isAFIPAuthorized(undefined, sale.CAE?.CAE);
        const isRemito = !isFacturaC;

        if (!FacturaC.active && !Remito.active) return true;
        if (FacturaC.active && Remito.active) return true;
        if (FacturaC.active) return isFacturaC;
        if (Remito.active) return isRemito;
        return false;
      })
      .filter((sale) => {
        const {
          Debito,
          UnPago,
          Ahora3,
          Ahora6,
          Transferencia,
          Efectivo,
          CuentaDNI,
        } = filtersState;

        const anyPaidMethodActive =
          Debito.active ||
          UnPago.active ||
          Ahora3.active ||
          Ahora6.active ||
          Transferencia.active ||
          Efectivo.active ||
          CuentaDNI.active;

        if (!anyPaidMethodActive) return true;

        const method = sale.paidMethod?.toLowerCase();
        return (
          (Efectivo.active && method === Efectivo.filter.toLowerCase()) ||
          (Debito.active && method === Debito.filter.toLowerCase()) ||
          (UnPago.active && method === UnPago.filter.toLowerCase()) ||
          (Ahora3.active && method === Ahora3.filter.toLowerCase()) ||
          (Ahora6.active && method === Ahora6.filter.toLowerCase()) ||
          (CuentaDNI.active && method === CuentaDNI.filter.toLowerCase()) ||
          (Transferencia.active && method === Transferencia.filter.toLowerCase())
        );
      })
      .filter((sale) => {
        const { endDate, startDate } = filtersState;
        const saleTime = sale.date.getTime();
        return (
          (!startDate.active || saleTime >= startDate.date.getTime()) &&
          (!endDate.active || saleTime <= endDate.date.getTime())
        );
      })
      .filter((sale) => {
        const { Seller } = filtersState;
        return !Seller.active || Seller.filter === sale.seller;
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [liveSales, filtersState]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentPage(1);
  }, [filtersState, itemsPerPage]);

  const total = React.useMemo(() => {
    return filteredSales.reduce((acc, sale) => acc + (sale.totalWithDiscount || 0), 0);
  }, [filteredSales]);

  const totalPages = Math.ceil(filteredSales.length / itemsPerPage);
  const currentSales = React.useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredSales.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredSales, currentPage, itemsPerPage]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setCurrentPage(1);
  }, [filteredSales.length, itemsPerPage]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div className="flex flex-col w-full">
      {refreshError && liveSales.length > 0 && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300" role="alert">
          {refreshError}
        </div>
      )}
      <div className="w-full bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Compact total bar */}
        <div className="flex items-center justify-between px-5 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {filteredSales.length} resultado{filteredSales.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">Total</span>
            <span className="text-xl font-bold text-gray-900 dark:text-gray-100 font-mono tabular-nums tracking-tight">
              ${total.toLocaleString("es-AR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>

        {/* Scrollable table */}
        <div className="overflow-x-auto">
          <div className="min-w-max p-1">
            {/* Table Header */}
            <div className="grid grid-cols-[2fr_2fr_2fr_3fr_2fr_90px] gap-4 px-5 py-3 border-b border-gray-100 dark:border-gray-700 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[700px] sm:w-full min-w-max">
              <div>Fecha</div>
              <div>Comprobante</div>
              <div>Medio Pago</div>
              <div>Vendedor</div>
              <div className="text-right pr-2">Total</div>
              <div className="text-center">Acciones</div>
            </div>

            {/* Table Body (Accordions) */}
            <div className="flex flex-col divide-y divide-gray-100 dark:divide-gray-700">
              {currentSales.map((sale) => (
                <React.Fragment key={sale.id}>
                  <SaleAccordion
                    session={session}
                    sale={{ ...sale, seller: sale.seller ?? "" }}
                    qzTrayEnabled={qzTrayEnabled}
                  />
                </React.Fragment>
              ))}
              {currentSales.length === 0 && (
                <div
                  className={`p-8 text-center ${emptyState || refreshError ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}`}
                  role={emptyState || refreshError ? "alert" : undefined}
                >
                  {emptyState ?? refreshError ?? "No hay ventas que coincidan con los filtros activos."}
                </div>
              )}
            </div>
          </div>
        </div>

        {hasMore && (
          <div hidden className="flex justify-center py-4 border-t border-gray-100 dark:border-gray-700">
            <Button
              variant="outline"
              onClick={handleLoadMore}
              disabled={loadingMore}
              hidden
              className="gap-2 border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700 focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <ChevronDown className={`h-4 w-4 ${loadingMore ? "animate-bounce" : ""}`} />
              {loadingMore ? "Cargando..." : "Cargar más"}
            </Button>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-4 gap-4 mt-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">Filas por página:</span>
          <Select
            value={itemsPerPage.toString()}
            onValueChange={(value) => setItemsPerPage(Number(value))}
          >
            <SelectTrigger className="w-[80px] h-8 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 focus-visible:ring-2 focus-visible:ring-blue-500">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-gray-200 bg-white text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
            Página {currentPage} de {totalPages || 1}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700 focus-visible:ring-2 focus-visible:ring-blue-500"
               onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
               disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700 focus-visible:ring-2 focus-visible:ring-blue-500"
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <PrintableTable
        className="hidden print:block"
        printTrigger={printTrigger}
        session={session}
        externalState={externalState}
        handleClose={() => setPrintTrigger(0)}
      />
    </div>
  );
};

export default SalesTable;
