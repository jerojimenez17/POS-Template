"use client";
import FilterState from "@/models/FiltersState";
import { useReducer } from "react";
import { FiltersReducer } from "./FiltersReducer";
import { FiltersContext } from "./FiltersContext";
import FilterField from "@/models/FilterField";

const INITIAL_STATE: FilterState = {
  Remito: {
    active: true,
    filter: "remito",
  } as FilterField,
  Seller: {
    active: false,
    filter: "Seleccionar Vendedor",
  } as FilterField,
  FacturaC: {
    active: false,
    filter: "facturac",
  } as FilterField,
  Debito: {
    active: false,
    filter: "debito",
  } as FilterField,
  UnPago: {
    active: false,
    filter: "Credito 1 pago",
  } as FilterField,
  Ahora3: {
    active: false,
    filter: "ahora 3",
  } as FilterField,
  Ahora6: {
    active: false,
    filter: "ahora 6",
  } as FilterField,
  Transferencia: {
    active: false,
    filter: "transferencia",
  } as FilterField,
  Efectivo: {
    active: true,
    filter: "efectivo",
  } as FilterField,
  CuentaDNI: {
    active: false,
    filter: "cuenta dni",
  } as FilterField,
  startDate: {
    active: false,
    date: new Date(),
  },
  endDate: {
    active: false,
    date: new Date(),
  },
};

interface props {
  children: JSX.Element | JSX.Element[];
}

const FiltersProvider = ({ children }: props) => {
  const [filtersState, dispatch] = useReducer(FiltersReducer, INITIAL_STATE);

  const switchRemito = () => {
    dispatch({
      type: "switchRemito",
      payload: null,
    });
  };
  const switchFacturaC = () => {
    dispatch({
      type: "switchFacturaC",
      payload: null,
    });
  };
  const switchDebito = () => {
    dispatch({
      type: "switchDebito",
      payload: null,
    });
  };
  const switchUnPago = () => {
    dispatch({
      type: "switchUnPago",
      payload: null,
    });
  };
  const switchAhora3 = () => {
    dispatch({
      type: "switchAhora3",
      payload: null,
    });
  };
  const switchAhora6 = () => {
    dispatch({
      type: "switchAhora6",
      payload: null,
    });
  };
  const switchTransferencia = () => {
    dispatch({
      type: "switchTransferencia",
      payload: null,
    });
  };
  const switchCuentaDNI = () => {
    dispatch({
      type: "switchCuentaDNI",
      payload: null,
    });
  };
  const switchEfectivo = () => {
    dispatch({
      type: "switchEfectivo",
      payload: null,
    });
  };
  const startDate = (date: Date) => {
    dispatch({
      type: "startDate",
      payload: date,
    });
  };
  const endDate = (date: Date) => {
    dispatch({
      type: "endDate",
      payload: date,
    });
  };
  const disableStartDate = () => {
    dispatch({
      type: "disableStartDate",
      payload: null,
    });
  };
  const disableEndDate = () => {
    dispatch({
      type: "disableEndDate",
      payload: null,
    });
  };
  const seller = (seller: string) => {
    dispatch({
      type: "seller",
      payload: seller,
    });
  };
  const disableSeller = () => {
    dispatch({
      type: "disableSeller",
      payload: null,
    });
  };
  const values = {
    filtersState: filtersState,
    switchRemito: switchRemito,
    switchFacturaC: switchFacturaC,
    switchDebito: switchDebito,
    switchEfectivo: switchEfectivo,
    switchUnPago: switchUnPago,
    switchAhora3: switchAhora3,
    switchAhora6: switchAhora6,
    switchCuentaDNI: switchCuentaDNI,
    switchTransferencia: switchTransferencia,
    startDate: startDate,
    endDate: endDate,
    disableEndDate: disableEndDate,
    disableStartDate: disableStartDate,
    seller: seller,
    disableSeller: disableSeller,
  };
  return (
    <FiltersContext.Provider value={values}>{children}</FiltersContext.Provider>
  );
};

export default FiltersProvider;
