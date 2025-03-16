"use client";
import React, { ReactElement, useEffect, useReducer } from "react";
import { BillContext } from "./BillContext";
import { BillReducer } from "./BillReducer";
import BillState from "@/models/BillState";
import Product from "@/models/Product";
import CAE from "@/models/CAE";

const INITIAL_STATE: BillState = {
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
  tipoFactura: "C",
  pago: false,
  entrega: 0,
  CAE: { CAE: "", nroComprobante: 0, vencimiento: "", qrData: "" },
  date: null,
};

interface props {
  children: ReactElement;
}

const BillProvider = ({ children }: props) => {
  const [BillState, dispatch] = useReducer(BillReducer, INITIAL_STATE);

  useEffect(() => {
    dispatch({ type: "date", payload: new Date() });
  }, []);

  const addItem = (product: Product) => {
    dispatch({
      type: "addItem",
      payload: product,
    });
  };
  const addUnit = (product: Product) => {
    dispatch({
      type: "addUnit",
      payload: product,
    });
  };
  const removeUnit = (product: Product) => {
    dispatch({
      type: "removeUnit",
      payload: product,
    });
  };
  const removeItem = (product: Product) => {
    dispatch({
      type: "removeItem",
      payload: product,
    });
  };
  const setState = (BillState: BillState) => {
    dispatch({
      type: "setState",
      payload: BillState,
    });
  };
  const removeAll = () => {
    dispatch({
      type: "removeAll",
      payload: null,
    });
  };
  const changePrice = (product: Product) => {
    dispatch({
      type: "changePrice",
      payload: product,
    });
  };
  const changeUnit = (product: Product) => {
    dispatch({
      type: "changeUnit",
      payload: product,
    });
  };
  const total = () => {
    dispatch({
      type: "total",
      payload: null,
    });
  };
  const discount = (disc: number) => {
    dispatch({
      type: "discount",
      payload: disc,
    });
  };
  const sellerName = (name: string) => {
    dispatch({
      type: "sellerName",
      payload: name,
    });
  };
  const typeDocument = (type: string) => {
    dispatch({
      type: "typeDocument",
      payload: type,
    });
  };
  const tipoFactura = (tipoFactura: string) => {
    dispatch({
      type: "tipoFactura",
      payload: tipoFactura,
    });
  };
  const documentNumber = (number: number) => {
    dispatch({
      type: "documentNumber",
      payload: number,
    });
  };
  const nroAsociado = (number: number) => {
    dispatch({
      type: "nroAsociado",
      payload: number,
    });
  };
  const IVACondition = (condition: string) => {
    dispatch({
      type: "IVACondition",
      payload: condition,
    });
  };
  const paidMethod = (method: string) => {
    dispatch({
      type: "paidMethod",
      payload: method,
    });
  };
  const entrega = (entrega: number) => {
    dispatch({
      type: "entrega",
      payload: entrega,
    });
  };
  const date = (newDate: Date) => {
    dispatch({
      type: "date",
      payload: newDate,
    });
  };
  const CAE = (CAE: CAE) => {
    dispatch({
      type: "CAE",
      payload: CAE,
    });
  };

  const values = {
    BillState: BillState,
    addItem: addItem,
    addUnit: addUnit,
    date: date,
    removeUnit: removeUnit,
    removeItem: removeItem,
    removeAll: removeAll,
    changePrice: changePrice,
    changeUnit: changeUnit,
    total: total,
    discount: discount,
    sellerName: sellerName,
    typeDocument: typeDocument,
    documentNumber: documentNumber,
    IVACondition: IVACondition,
    CAE: CAE,
    tipoFactura: tipoFactura,
    entrega: entrega,
    nroAsociado: nroAsociado,
    setState: setState,
    paidMethod: paidMethod,
  };
  return <BillContext.Provider value={values}>{children}</BillContext.Provider>;
};

export default BillProvider;
