"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface MobileNavContextType {
  open: boolean;
  setOpen: (v: boolean) => void;
}

const MobileNavContext = createContext<MobileNavContextType>({
  open: false,
  setOpen: () => {},
});

export const MobileNavProvider = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  return (
    <MobileNavContext.Provider value={{ open, setOpen }}>
      {children}
    </MobileNavContext.Provider>
  );
};

export const useMobileNav = () => useContext(MobileNavContext);
