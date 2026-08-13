import { createContext, Dispatch } from "react";
import BillState from "@/models/BillState";
import Product from "@/models/Product";
import { BillAction } from "./billActions";

export type PrintMode = "thermal" | "pdf";

export default interface BillContextProps {
  BillState: BillState;
  dispatch: Dispatch<BillAction>;
  addItem: (product: Product) => void;
  removeItem: (product: Product) => void;
  onOrderResetRef: React.MutableRefObject<(() => void) | null>;
  printMode: PrintMode;
  setPrintMode: (mode: PrintMode) => void;
  qzTrayEnabled?: boolean;
  focusPriceProductId?: string | null;
  setFocusPriceProductId?: (id: string | null) => void;
}

export const BillContext = createContext<BillContextProps>(
  {} as BillContextProps
);
