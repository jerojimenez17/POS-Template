"use client";
import React, { ReactElement, useEffect, useReducer, useRef } from "react";
import { BillContext } from "./BillContext";
import { BillReducer } from "./BillReducer";
import BillState from "@/models/BillState";
import Product from "@/models/Product";
import { PrintMode } from "./BillContext";

const INITIAL_STATE: BillState = {
  twoMethods: false,
  id: "",
  products: [],
  total: 0,
  totalWithDiscount: 0,
  discount: 0,
  seller: "",
  typeDocument: "",
  documentNumber: 0,
  IVACondition: "Consumidor Final",
  paidMethod: "Efectivo",
  nroAsociado: 0,
  billType: "Remito",
  pago: false,
  entrega: 0,
  CAE: { CAE: "", nroComprobante: 0, vencimiento: "", qrData: "" },
  date: new Date(),
};

interface props {
  children: ReactElement | ReactElement[];
}

const BillProvider = ({ children }: props) => {
  const [BillState, dispatch] = useReducer(BillReducer, INITIAL_STATE);
  const [printMode, setPrintMode] = React.useState<PrintMode>("thermal");
  const [qzTrayActive, setQzTrayActive] = React.useState<boolean>(() => {
    const saved = localStorage.getItem("qzTrayActive");
    return saved !== null ? saved === "true" : true;
  });
  const onOrderResetRef = useRef<(() => void) | null>(null);

  const handleSetQzTrayActive = (active: boolean) => {
    setQzTrayActive(active);
    localStorage.setItem("qzTrayActive", String(active));
  };

  useEffect(() => {
    dispatch({ type: "date", payload: new Date() });
  }, []);

  const addItem = (product: Product) => {
    dispatch({ type: "addItem", payload: product });
  };

  const removeItem = (product: Product) => {
    dispatch({ type: "removeItem", payload: { id: product.id } });
  };

  const values = {
    BillState: BillState,
    dispatch: dispatch,
    addItem: addItem,
    removeItem: removeItem,
    onOrderResetRef: onOrderResetRef,
    printMode: printMode,
    setPrintMode: setPrintMode,
    qzTrayActive: qzTrayActive,
    setQzTrayActive: handleSetQzTrayActive,
  };
  return <BillContext.Provider value={values}>{children}</BillContext.Provider>;
};

export default BillProvider;
