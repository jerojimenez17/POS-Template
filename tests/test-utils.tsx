import React, { ReactElement } from "react";
import { render, RenderOptions } from "@testing-library/react";
import { SessionProvider } from "next-auth/react";
import { BillContext } from "@/context/BillContext";
import { CashboxProvider } from "@/context/CashboxContext";
import { vi } from "vitest";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

interface AllTheProvidersProps {
  children: React.ReactNode;
  sessionMock?: any;
  billContextMock?: any;
}

const defaultBillContextValue = {
  BillState: {
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
    billType: "Factura C",
    twoMethods: false,
    totalSecondMethod: 0,
    secondPaidMethod: "Debito",
    date: new Date(),
  },
  addItem: vi.fn(),
  addUnit: vi.fn(),
  removeUnit: vi.fn(),
  removeAll: vi.fn(),
  removeItem: vi.fn(),
  changePrice: vi.fn(),
  changeUnit: vi.fn(),
  total: vi.fn(),
  discount: vi.fn(),
  sellerName: vi.fn(),
  typeDocument: vi.fn(),
  documentNumber: vi.fn(),
  entrega: vi.fn(),
  nroAsociado: vi.fn(),
  IVACondition: vi.fn(),
  paidMethod: vi.fn(),
  billType: vi.fn(),
  date: vi.fn(),
  CAE: vi.fn(),
  setState: vi.fn(),
  onOrderResetRef: { current: null },
  printMode: "thermal" as const,
  setPrintMode: vi.fn(),
  qzTrayActive: false,
  setQzTrayActive: vi.fn(),
};

const AllTheProviders = ({
  children,
  sessionMock,
  billContextMock,
}: AllTheProvidersProps) => {
  return (
    <SessionProvider session={sessionMock}>
      <BillContext.Provider value={billContextMock || defaultBillContextValue}>
        <CashboxProvider>
          {children}
        </CashboxProvider>
      </BillContext.Provider>
    </SessionProvider>
  );
};

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper"> & {
    sessionMock?: any;
    billContextMock?: any;
  }
) =>
  render(ui, {
    wrapper: (props) => (
      <AllTheProviders
        {...props}
        sessionMock={options?.sessionMock}
        billContextMock={options?.billContextMock}
      />
    ),
    ...options,
  });

export * from "@testing-library/react";
export { customRender as render };
