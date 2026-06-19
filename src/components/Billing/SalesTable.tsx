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
import { getSalesAction } from "@/actions/sales";

import { Session } from "next-auth";

interface props {
  sales: BillState[];
  nextCursor: string | null;
  session: Session | null;
}

const SalesTable = ({ sales = [], nextCursor: initialCursor, session }: props) => {
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
  useEffect(() => {
    if (user?.email !== process.env.ADMIN_EMAIL && user?.email) {
      seller(user.email);
    }
  }, [user, seller]);

  useEffect(() => {
    setLiveSales(sales);
    setCursor(initialCursor);
    setHasMore(initialCursor !== null);
  }, [sales, initialCursor]);

  useEffect(() => {
    if (session?.user?.businessId) {
      const channelName = `orders-${session.user.businessId}`;
      const channel = pusherClient.subscribe(channelName);
      
      const handleUpdate = async () => {
        const result = await getSalesAction();
        if (result) {
          setLiveSales(result.sales);
        }
      };

      channel.bind("orders-update", handleUpdate);

      return () => {
        channel.unbind("orders-update", handleUpdate);
      };
    }
  }, [session?.user?.businessId]);

  const handleLoadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await getSalesAction({ cursor });
      if (result.sales.length > 0) {
        setLiveSales((prev) => [...prev, ...result.sales]);
        setCursor(result.nextCursor);
        setHasMore(result.nextCursor !== null);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error("Error loading more sales:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  const filteredSales = React.useMemo(() => {
    return liveSales
      .filter((sale) => {
        const { Remito, FacturaC } = filtersState;
        const isFacturaC = sale.CAE && sale.CAE.CAE !== "";
        const isRemito = !sale.CAE || sale.CAE.CAE === "";

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

  const total = React.useMemo(() => {
    return filteredSales.reduce((acc, sale) => acc + (sale.totalWithDiscount || 0), 0);
  }, [filteredSales]);

  const totalPages = Math.ceil(filteredSales.length / itemsPerPage);
  const currentSales = React.useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredSales.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredSales, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredSales.length, itemsPerPage]);

  return (
    <div className="flex flex-col w-full">
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
                <SaleAccordion
                  session={session}
                  key={sale.id}
                  sale={sale}
                />
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
              className="gap-2"
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
          <span className="text-sm text-gray-500 font-medium">Filas por página:</span>
          <Select
            value={itemsPerPage.toString()}
            onValueChange={(value) => setItemsPerPage(Number(value))}
          >
            <SelectTrigger className="w-[70px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="text-gray-800">
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500 font-medium">
            Página {currentPage} de {totalPages || 1}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
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
