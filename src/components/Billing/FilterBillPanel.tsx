"use client";
import React, { useContext, useEffect, useState } from "react";
import FilterSwitch from "./FilterSwitch";
import { FiltersContext } from "@/context/FiltersContext/FiltersContext";
import moment from "moment";
import "moment/locale/es";
import DatePicker from "react-datetime";
import "react-datetime/css/react-datetime.css";
import CalendarIcon from "./CalendarIcon";
import Select from "./Select";
import { getUniqueSellersAction } from "@/actions/sales";
import { Session } from "next-auth";

interface props {
  session: Session | null;
}
const FilterBillPanel = ({ session }: props) => {
  const {
    filtersState,
    switchAhora3,
    switchEfectivo,
    switchAhora6,
    switchDebito,
    switchRemito,
    switchCuentaDNI,
    switchFacturaC,
    switchTransferencia,
    switchUnPago,
    startDate,
    disableSeller,
    seller,
    endDate,
  } = useContext(FiltersContext);

  const [sellers, setSellers] = useState<string[]>([]);
  
  // Compute default seller synchronously during render (derived from props)
  const defaultSeller = session?.user?.email && session.user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL 
    ? session.user.email 
    : undefined;

  useEffect(() => {
    // Vercel Best Practice (client-side data fetching bottleneck fixed):
    // Only fetch unique sellers, not all sales.
    getUniqueSellersAction().then((uniqueSellers) => {
      setSellers(uniqueSellers);
    });
  }, []);

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto mb-6">
      {/* Sellers Row */}
      <div className="flex justify-start w-full md:w-1/3">
        <Select
          active={true}
          value={filtersState.Seller.filter}
          options={sellers}
          handleChange={(e) => {
            if (e.target.value === "Seleccionar Vendedor") {
              disableSeller();
            } else {
              seller(e.target.value);
            }
          }}
          id="SellersSelector"
          defaultValue="Seleccionar Vendedor"
        />
      </div>

      {/* Filters Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
        
        {/* Document Types */}
        <div className="flex flex-col gap-3">
          <p className="font-semibold text-gray-800 dark:text-gray-200">Tipos Factura</p>
          <div className="flex flex-col gap-2">
            <FilterSwitch
              text="Facturas"
              handleClick={() => switchFacturaC()}
              active={filtersState.FacturaC.active}
            />
            <FilterSwitch
              text="Remitos"
              handleClick={() => switchRemito()}
              active={filtersState.Remito.active}
            />
          </div>
        </div>

        {/* Date Filters */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              className="text-sm font-semibold text-gray-800 dark:text-gray-200"
              htmlFor="dateStartPicker"
            >
              Fecha Desde
            </label>
            <div
              id="dateStartPicker"
              className="flex items-center gap-2 bg-white dark:bg-gray-700 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-gray-100 focus-within:ring-2 focus-within:ring-blue-500 transition-shadow w-full"
            >
              <DatePicker
                value={filtersState.startDate.date}
                locale="es"
                onChange={(e) => {
                  startDate(new Date(e.toString()));
                }}
                input={true}
                className="w-full bg-transparent outline-none grow"
              />
              <CalendarIcon className="text-gray-500 dark:text-gray-400 shrink-0" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label
              className="text-sm font-semibold text-gray-800 dark:text-gray-200"
              htmlFor="dateEndPicker"
            >
              Fecha Hasta
            </label>
            <div
              id="dateEndPicker"
              className="flex items-center gap-2 bg-white dark:bg-gray-700 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-gray-100 focus-within:ring-2 focus-within:ring-blue-500 transition-shadow w-full"
            >
              <DatePicker
                locale="es"
                onChange={(e) => {
                  endDate(new Date(e.toString()));
                }}
                value={moment(filtersState.endDate.date)}
                input={true}
                className="w-full bg-transparent outline-none grow"
              />
              <CalendarIcon className="text-gray-500 dark:text-gray-400 shrink-0" />
            </div>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="flex flex-col gap-3">
          <p className="font-semibold text-gray-800 dark:text-gray-200">Medios de Pago</p>
          <div className="flex flex-wrap gap-2">
            <FilterSwitch
              text="Efectivo"
              handleClick={() => switchEfectivo()}
              active={filtersState.Efectivo.active}
            />
            <FilterSwitch
              text="Debito"
              handleClick={() => switchDebito()}
              active={filtersState.Debito.active}
            />
            <FilterSwitch
              text="Un Pago"
              handleClick={() => switchUnPago()}
              active={filtersState.UnPago.active}
            />
            <FilterSwitch
              text="Ahora 3"
              handleClick={() => switchAhora3()}
              active={filtersState.Ahora3.active}
            />
            <FilterSwitch
              text="Ahora 6"
              handleClick={() => switchAhora6()}
              active={filtersState.Ahora6.active}
            />
            <FilterSwitch
              text="Cuenta DNI"
              handleClick={() => switchCuentaDNI()}
              active={filtersState.CuentaDNI.active}
            />
            <FilterSwitch
              text="Transferencia"
              handleClick={() => switchTransferencia()}
              active={filtersState.Transferencia.active}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilterBillPanel;
