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
import { fetchSalesOnce } from "@/services/firebaseService";
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

  const [sellerArray, setSellerArray] = useState<string[]>([]);
  const [sellers, setSellers] = useState<string[]>([]);

  useEffect(() => {
    fetchSalesOnce().then((sales) => {
      setSellers(Array.from(new Set(sales.map((sale) => sale.seller))));
    });
  }, []);
  useEffect(() => {
    if (
      session?.user?.email !== process.env.ADMIN_EMAIL &&
      session?.user &&
      session.user.email
    ) {
      const newArray = [];
      newArray.push(session.user.email);
      setSellerArray(newArray);
    }
  }, []);
  return (
    <>
      <div className="row max-w-xl mx-auto h-20">
        <div className="col">
          {/* <FilterSwitch text="Filtrar por vendedor" active={filtersState.Seller.active} handleClick={()=> }/> */}
        </div>
        <div className="col mt-4">
          <Select
            active={filtersState.Seller.active}
            value={filtersState.Seller.filter}
            options={
              session?.user?.email === process.env.ADMIN_EMAIL
                ? sellers
                : sellerArray
            }
            handleChange={(e) => {
              if (e.target.value === "Seleccionar Vendedor") {
                disableSeller();
              } else {
                seller(e.target.value);
              }
            }}
            id="SellersSelector"
            defaultValue={
              session?.user?.email === process.env.ADMIN_EMAIL
                ? "Seleccionar Vendedor"
                : undefined
            }
          />
        </div>
      </div>
      <div className="row mt-3 p-2">
        <div className="col p-2">
          <p className="font-semibold">Tipos Factura</p>
          <div className="col">
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
        <div className="col p-2 m-2 flex flex-col gap-2 items-center justify-center">
          <label
            className="text-gray-800 font-semibold"
            htmlFor="dateStartPicker"
          >
            Fecha Desde
          </label>
          <div
            id="dateStartPicker"
            className="bg-transparent flex gap-2 items-center rounded relative text-black"
            // data-bs-toggle="modal"
            // data-bs-target="#staticBackdrop"
          >
            <DatePicker
              value={filtersState.startDate.date}
              locale="es"
              onChange={(e) => {
                startDate(new Date(e.toString()));
                console.log(filtersState.startDate.date);
              }}
              input={true}
              className="appearance-none shadow-sm border rounded py-2 px-3 text-gray-darker "
            ></DatePicker>
            <CalendarIcon />
          </div>
          <label
            className="text-gray-800 font-semibold"
            htmlFor="dateEndPicker"
          >
            Fecha Hasta
          </label>
          <div
            id="dateEndPicker"
            className="bg-transparent flex gap-2 items-center rounded relative text-black"
            // data-bs-toggle="modal"
            // data-bs-target="#staticBackdrop"
          >
            <DatePicker
              locale="es"
              onChange={(e) => {
                endDate(new Date(e.toString()));
              }}
              value={moment(filtersState.endDate.date)}
              input={true}
              className="appearance-none shadow-sm border rounded py-2 px-3 text-gray-darker "
            ></DatePicker>
            <CalendarIcon />
          </div>
        </div>
        <div className="col p-2">
          <p className="font-semibold">Medios de Pago</p>
          <div className="col mt-4 p-2">
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
    </>
  );
};

export default FilterBillPanel;
