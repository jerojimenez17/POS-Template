"use client";
import React, { useContext, useEffect, useRef, useState } from "react";
import BillState from "@/models/BillState";
import SaleAccordion from "./SaleAccordion";
import { FiltersContext } from "@/context/FiltersContext/FiltersContext";
import PrintableTable from "./PrintableTable";
import { useReactToPrint } from "react-to-print";
import { useAuthContext } from "@/context/AuthContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./../ui/select";
import { Button } from "./../ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Session } from "next-auth";

interface props {
  sales: BillState[];
  session: Session | null;
}

const SalesTable = ({ sales = [], session }: props) => {
  const { user } = useAuthContext();
  const [print, setPrint] = useState(false);
  const [externalState, setExternalState] = useState<BillState>();

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);



  const printRef = useRef(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
  });
  useEffect(() => {
    if (user?.email !== process.env.ADMIN_EMAIL && user && user.email) {
      seller(user?.email);
    }
  }, []);

  const { filtersState, seller } = useContext(FiltersContext);

  const filteredSales = React.useMemo(() => {
    return sales
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
  }, [sales, filtersState]);

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
    <div className="text-center text-black flex flex-col w-full mb-20 px-4">
      {" "}
      <div className="h-20 my-8 sm:my-2 md:my-6 lg:my-4">
        <p className="p-3 text-2xl text-gray-800 font-bold">
          Total: $
          {total.toLocaleString("es-AR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </p>
      </div>
      <div className="h-full mb-5 pb-4">
        {currentSales.map((sale) => (
          <div key={sale.id} className="">
            <SaleAccordion
              user={user}
              key={sale.id}
              sale={sale}
              onClick={() => {
                setExternalState(sale);
                setTimeout(() => {
                  setPrint(!print);
                }, 100);
              }}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-4 bg-white bg-opacity-50 gap-4 mt-auto rounded-lg shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700 font-medium">Filas por página:</span>
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
          <span className="text-sm text-gray-700 font-medium">
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
        print={print}
        session={session}
        externalState={externalState}
        handleClose={() => setPrint(false)}
      />
    </div>
  );
};

export default SalesTable;
