import { createContext } from "react";
import Product from "../../../models/Product";
import Order from "@/models/Order";

export default interface CartContextProps {
  cartState: Order;
  addItem: (product: Product) => void;
  addUnit: (product: Product) => void;
  removeUnit: (product: Product) => void;
  removeAll: () => void;
  removeItem: (product: Product) => void;
  changePrice: (product: Product) => void;
  changeAmount: (product: Product) => void;
  total: () => void;
  discount: (disc: number) => void;
  // clientName: (name: string) => void;
  // typeDocument: (type: string) => void;
  // documentNumber: (number: number) => void;
  entrega: (number: number) => void;
  // nroAsociado: (number: number) => void;
  // IVACondition: (condition: string) => void;
  // tipoFactura: (tipoFactura: string) => void;
  // CAE: (cae: CAE) => void;
  setState: (cartState: Order) => void;
}

export const CartContext = createContext<CartContextProps>(
  {} as CartContextProps
);
