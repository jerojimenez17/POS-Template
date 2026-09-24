"use client";
import React, { useContext, useEffect, useState } from "react";
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
import { serializeSalesFilters } from "./serialize-sales-filters";

import { Session } from "next-auth";

interface props {
  sales: BillState[];
  nextCursor: string | null;
  session: Session | null;
  qzTrayEnabled?: boolean;
}

const dedupe = (items: BillState[]): BillState[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

const SalesTable = ({ sales = [], nextCursor: initialCursor, session, qzTrayEnabled = false }: props) => {
  const user = session?.user;
  const [printTrigger, setPrintTrigger] = useState(0);
  const [externalState] = useState<BillState>();

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [liveSales, setLiveSales] = useState<BillState[]>(sales);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [hasMore, setHasMore] = useState(initialCursor !== null);
  const [loadingMore, setLoadingMore] = useState(false);

  const { filtersState, seller } = useContext(FiltersContext);
  const filters = React.useMemo(() => serializeSalesFilters(filtersState), [filtersState]);
  const filterSnapshot = React.useMemo(() => JSON.stringify(filters), [filters]);
  const snapshotRef = React.useRef(filterSnapshot);
  const initialQueryRef = React.useRef(false);
  const requestRef = React.useRef(0);
  useEffect(() => {
    if (user?.email !== process.env.ADMIN_EMAIL && user?.email) {
      seller(user.email);
    }
  }, [user, seller]);

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
  }, [sales, initialCursor]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (session?.user?.businessId) {
      const channelName = `orders-${session.user.businessId}`;
      const channel = pusherClient.subscribe(channelName);
      
      const handleUpdate = async () => {
        const requestId = ++requestRef.current;
        setLoadingMore(false);
        const result = await getSalesAction({ cursor: undefined, filters });
        if (requestId !== requestRef.current) return;
        if (result) {
          setLiveSales(dedupe(result.sales));
          setCursor(result.nextCursor);
          setHasMore(result.nextCursor !== null);
          setCurrentPage(1);
        }
      };

      channel.bind("orders-update", handleUpdate);

      return () => {
        channel.unbind("orders-update", handleUpdate);
      };
    }
  }, [session?.user?.businessId, filters]);

  useEffect(() => {
    // The page intentionally does not provide server-rendered sales. The
    // initial request must be made here, after FiltersContext is available,
    // rather than reusing an unfiltered server response.
    const requiresSellerScope = Boolean(user?.email && user.email !== process.env.ADMIN_EMAIL);
    const sellerScopeReady = !requiresSellerScope || filters.seller === user?.email;
    const needsInitialQuery = !initialQueryRef.current && sales.length === 0 && initialCursor === null && sellerScopeReady;
    if (!needsInitialQuery && snapshotRef.current === filterSnapshot) return;
    initialQueryRef.current = true;
    snapshotRef.current = filterSnapshot;
    const requestId = ++requestRef.current;
    setLoadingMore(false);
    setCurrentPage(1);
    void getSalesAction({ cursor: undefined, filters }).then((result) => {
      if (requestId !== requestRef.current) return;
      setLiveSales(dedupe(result.sales));
      setCursor(result.nextCursor);
      setHasMore(result.nextCursor !== null);
    }).catch((error: unknown) => console.error("Error loading filtered sales:", error));
    return () => { requestRef.current += 1; };
  }, [filterSnapshot, filters, initialCursor, sales.length, user?.email]);

  const handleLoadMore = async () => {
    if (!cursor || loadingMore) return;
    const requestId = requestRef.current;
    setLoadingMore(true);
    try {
      const result = await getSalesAction({ cursor, filters });
      if (requestId !== requestRef.current) return;
      if (result.sales.length > 0) {
        setLiveSales((prev) => dedupe([...prev, ...result.sales]));
        setCursor(result.nextCursor);
        setHasMore(result.nextCursor !== null);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error("Error loading more sales:", error);
    } finally {
      if (requestId === requestRef.current) setLoadingMore(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentPage(1);
  }, [filtersState, itemsPerPage]);

  const total = React.useMemo(() => {
    return liveSales.reduce((acc, sale) => acc + (sale.totalWithDiscount || 0), 0);
  }, [liveSales]);

  const totalPages = Math.ceil(liveSales.length / itemsPerPage);
  const currentSales = React.useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return liveSales.slice(startIndex, startIndex + itemsPerPage);
  }, [liveSales, currentPage, itemsPerPage]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setCurrentPage(1);
  }, [liveSales.length, itemsPerPage]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div className="flex flex-col w-full">
      <div className="w-full bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Compact total bar */}
        <div className="flex items-center justify-between px-5 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {liveSales.length} resultado{liveSales.length !== 1 ? "s" : ""}
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
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  No se encontraron ventas con los filtros actuales.
                </div>
              )}
            </div>
          </div>
        </div>

        {hasMore && (
          <div className="flex justify-center py-4 border-t border-gray-100 dark:border-gray-700">
            <Button
              variant="outline"
              onClick={handleLoadMore}
              disabled={loadingMore}
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
            <SelectTrigger className="w-[70px] h-8 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 focus-visible:ring-2 focus-visible:ring-blue-500">
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
