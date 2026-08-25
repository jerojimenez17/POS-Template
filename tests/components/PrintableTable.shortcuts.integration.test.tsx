import React, { useContext, useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BillProvider from "@/context/BillProvider";
import { BillContext } from "@/context/BillContext";
import PrintableTable from "@/components/Billing/PrintableTable";
import Product from "@/models/Product";

vi.mock("@/actions/business", () => ({
  getBusinessBillingInfoAction: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/actions/stock", () => ({
  getProductByCode: vi.fn().mockResolvedValue(null),
  getProductsBySearch: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/print", () => ({
  printThermalReceipt: vi.fn().mockResolvedValue(true),
  exportToPDF: vi.fn().mockResolvedValue(true),
  buildPDFHTML: vi.fn().mockReturnValue("<div></div>"),
  PDF_STYLES: "",
}));

vi.mock("next/font/google", () => ({
  Inter: vi.fn(() => ({ className: "inter-font" })),
}));

// Merged PrintableTable graph (useFeatures → next-auth/react) requires a
// session context; mirror the same identity passed via props.
vi.mock("next-auth/react", () => ({
  useSession: vi.fn(() => ({
    data: {
      user: {
        email: "test@example.com",
        businessName: "Test Business",
        business: { features: {} },
      },
    },
    status: "authenticated",
  })),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Merged PrintableTable renders ProductSearchBar, which guards on useCashbox
// (fix-searchbar union). Harness mock with sensible active-session defaults,
// mirroring tests/components/BillButtons.shortcuts.test.tsx.
vi.mock("@/context/CashboxContext", () => ({
  useCashbox: vi.fn(() => ({
    hasActiveSession: true,
    setHasActiveSession: vi.fn(),
    isClosing: false,
    setIsClosing: vi.fn(),
    isOpeningModalOpen: false,
    setIsOpeningModalOpen: vi.fn(),
  })),
  CashboxProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const shortcutProduct = Object.assign(new Product(), {
  id: "shortcut-f1",
  code: "VAR001",
  description: "Producto shortcut",
  salePrice: 0,
  amount: 1,
});

const shortcutSession = {
  user: {
    email: "test@example.com",
    businessName: "Test Business",
    business: { features: {} },
  },
};

const BillWithShortcut = () => {
  const { addItem, dispatch } = useContext(BillContext);

  useEffect(() => {
    addItem(shortcutProduct);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() =>
          dispatch({
            type: "updateSalePrice",
            payload: { id: "shortcut-f1", salePrice: 125.5 },
          })
        }
      >
        confirm-shortcut-price
      </button>
      <PrintableTable
        printTrigger={0}
        className=""
        handleClose={vi.fn()}
        session={shortcutSession as never}
      />
    </>
  );
};

describe("shortcut price editing integration", () => {
  // NOTE: the old flow clicked an inline "Precio del producto …" editor.
  // Neither our pre-merge tip nor the merged tree renders one (report-C kept
  // our read-only price cell; PriceEditInput is currently orphaned — flagged
  // in reports B/C as a product follow-up). The reducer-level guarantee this
  // suite exists for — updateSalePrice recomputes row subtotal AND general
  // total immediately (fix-shortcut-price-total CA-01) — is driven through
  // dispatch directly.
  it("updates the visible subtotal and total after confirming a shortcut price", async () => {
    render(
      <BillProvider>
        <BillWithShortcut />
      </BillProvider>,
    );

    await screen.findByText("Producto shortcut");

    fireEvent.click(screen.getByText("confirm-shortcut-price"));

    await waitFor(() => {
      expect(screen.getByText("Total").parentElement).toHaveTextContent("$126,00");
    });
    // Row shows the exact entered price (2 decimals); only the general total
    // applies the reducer's Math.round (125.5 → 126).
    expect(screen.getByText("Producto shortcut").closest("tr")).toHaveTextContent("$125,50");
  });
});
