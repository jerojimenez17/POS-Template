"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

interface CashboxContextType {
  hasActiveSession: boolean;
  setHasActiveSession: (has: boolean) => void;
  isClosing: boolean;
  setIsClosing: (closing: boolean) => void;
  isOpeningModalOpen: boolean;
  setIsOpeningModalOpen: (open: boolean) => void;
}

const CashboxContext = createContext<CashboxContextType | undefined>(undefined);

export const CashboxProvider = ({ children }: { children: ReactNode }) => {
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isOpeningModalOpen, setIsOpeningModalOpen] = useState(false);

  return (
    <CashboxContext.Provider
      value={{
        hasActiveSession,
        setHasActiveSession,
        isClosing,
        setIsClosing,
        isOpeningModalOpen,
        setIsOpeningModalOpen,
      }}
    >
      {children}
    </CashboxContext.Provider>
  );
};

export const useCashbox = () => {
  const context = useContext(CashboxContext);
  if (context === undefined) {
    throw new Error("useCashbox must be used within a CashboxProvider");
  }
  return context;
};
