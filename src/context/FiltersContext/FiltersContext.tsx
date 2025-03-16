"use client";
import FiltersState from "@/models/FiltersState";
import { createContext } from "react";

export default interface FiltersContextProps {
  filtersState: FiltersState;
  switchRemito: () => void;
  switchFacturaC: () => void;
  switchDebito: () => void;
  switchEfectivo: () => void;
  switchUnPago: () => void;
  switchAhora3: () => void;
  switchAhora6: () => void;
  switchTransferencia: () => void;
  switchCuentaDNI: () => void;
  startDate: (date: Date) => void;
  seller: (seller: string) => void;
  endDate: (date: Date) => void;
  disableSeller: () => void;
}

export const FiltersContext = createContext<FiltersContextProps>(
  {} as FiltersContextProps
);
