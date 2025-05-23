"use client";
import React, { useContext, useEffect, useMemo, useState } from "react";
import BillState from "@/models/BillState";
import { FiltersContext } from "@/context/FiltersContext/FiltersContext";
import PrintableTable from "./PrintableTable";
import SaleAccordion from "./SaleAccordion";
import { fetchSalesByDate } from "@/services/firebaseService";
import { Session } from "next-auth";

interface props {
  session: Session | null;
}

const SalesTable = ({ session }: props) => {
  const [sales, setSales] = useState<BillState[]>([]);
  const [print, setPrint] = useState(false);
  const [externalState, setExternalState] = useState<BillState>();
  const { filtersState, seller } = useContext(FiltersContext);

  useEffect(() => {
    if (filtersState.startDate.active) {
      fetchSalesByDate(
        filtersState.startDate.date,
        filtersState.endDate.date
      ).then((sales) => {
        setSales(sales);
      });
    }
    // fetchSalesOnce()
    //   .then((sales) => {
    //     // Asegurar que sale.date sea un objeto Date
    //     const formattedSales = sales.map((sale) => ({
    //       ...sale,
    //       date: sale.date instanceof Date ? sale.date : new Date(sale.date),
    //     }));
    //     setSales(formattedSales);
    //   })
    //   .catch(() => console.error("Error al obtener ventas"));
  }, [filtersState]);

  useEffect(() => {
    if (
      session?.user?.email !== process.env.ADMIN_EMAIL &&
      session?.user?.email
    ) {
      seller(session.user.email);
    }
  }, [session]);

  const filteredSales = useMemo(() => {
    return sales
      .filter((sale) => {
        const { Remito, FacturaC } = filtersState;
        return (
          (FacturaC.active && sale.CAE?.CAE !== "") ||
          (Remito.active && sale.CAE?.CAE === "")
        );
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
        const method = sale.paidMethod?.toLowerCase();
        return (
          (Efectivo.active && method === Efectivo.filter.toLowerCase()) ||
          (Debito.active && method === Debito.filter.toLowerCase()) ||
          (UnPago.active && method === UnPago.filter.toLowerCase()) ||
          (Ahora3.active && method === Ahora3.filter.toLowerCase()) ||
          (Ahora6.active && method === Ahora6.filter.toLowerCase()) ||
          (Transferencia.active &&
            method === Transferencia.filter.toLowerCase()) ||
          (CuentaDNI.active && method === CuentaDNI.filter.toLowerCase())
        );
      })
      .filter((sale) => {
        const { endDate, startDate } = filtersState;
        if (!sale.date) return false;
        const saleTime = sale.date.getTime();
        const startOk = startDate.active
          ? saleTime >= startDate.date.getTime()
          : true;
        const endOk = endDate.active
          ? saleTime <= endDate.date.getTime()
          : true;
        return startOk && endOk;
      })
      .filter((sale) => {
        const { Seller } = filtersState;
        return Seller.active ? Seller.filter === sale.seller : true;
      })
      .sort((a, b) => {
        if (!a.date || !b.date) return 0;
        return b.date.getTime() - a.date.getTime();
      });
  }, [sales, filtersState]);

  const total = useMemo(() => {
    return filteredSales.reduce((acc, sale) => acc + sale.totalWithDiscount, 0);
  }, [filteredSales]);

  return (
    <div className="text-center text-black flex flex-col w-full mb-20">
      <div className="h-20 my-8 sm:my-2 md:my-6 lg:my-4">
        <p className="p-3 text-2xl text-gray-800 font-bold">
          Total: $
          {total.toLocaleString("es-AR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </p>
      </div>

      <div className="h-full mb-5 overflow-auto">
        {filteredSales.map((sale) => (
          <div key={sale.id}>
            <SaleAccordion
              deleteSaleFunc={(deleteSale) => {
                const newSales = sales.filter((sale) => {
                  return sale.id !== deleteSale.id;
                });
                setSales(newSales);
              }}
              session={session}
              key={sale.id}
              sale={sale}
              onClick={() => {
                setExternalState(sale);
                setTimeout(() => setPrint(!print), 300);
              }}
            />
          </div>
        ))}
      </div>

      {externalState && externalState.id !== "" && print && (
        <PrintableTable
          className="hidden print:block"
          print={print}
          externalState={externalState}
          handleClose={() => setPrint(false)}
          session={session}
        />
      )}
    </div>
  );
};

export default SalesTable;
