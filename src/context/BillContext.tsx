import { createContext } from "react";
import Product from "@/models/Product";
import BillState from "@/models/BillState";
import CAE from "@/models/CAE";

export default interface BillContextProps {
  BillState: BillState;
  addItem: (product: Product) => void;
  addUnit: (product: Product) => void;
  removeUnit: (product: Product) => void;
  removeAll: () => void;
  removeItem: (product: Product) => void;
  changePrice: (product: Product) => void;
  changeUnit: (product: Product) => void;
  total: () => void;
  discount: (disc: number) => void;
  sellerName: (name: string) => void;
  typeDocument: (type: string) => void;
  documentNumber: (number: number) => void;
  entrega: (number: number) => void;
  nroAsociado: (number: number) => void;
  IVACondition: (condition: string) => void;
  paidMethod: (method: string) => void;
  tipoFactura: (tipoFactura: string) => void;
  date: (newDate: Date) => void;
  CAE: (cae: CAE) => void;
  setState: (BillState: BillState) => void;
}

export const BillContext = createContext<BillContextProps>(
  {} as BillContextProps
);
