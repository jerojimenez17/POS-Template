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
  const { addItem } = useContext(BillContext);

  useEffect(() => {
    addItem(shortcutProduct);
  }, []);

  return (
    <PrintableTable
      printTrigger={0}
      className=""
      handleClose={vi.fn()}
      session={shortcutSession as never}
    />
  );
};

describe("shortcut price editing integration", () => {
  it("updates the visible subtotal and total after confirming a shortcut price", async () => {
    render(
      <BillProvider>
        <BillWithShortcut />
      </BillProvider>,
    );

    await screen.findByText("Producto shortcut");

    fireEvent.click(
      screen.getByRole("button", { name: "Precio del producto shortcut-f1" }),
    );
    const input = screen.getByRole("textbox", {
      name: "Precio del producto shortcut-f1",
    });
    fireEvent.change(input, { target: { value: "125.50" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.getByText("Total").parentElement).toHaveTextContent("$126,00");
    });
    expect(screen.getByText("Producto shortcut").closest("tr")).toHaveTextContent("$126");
  });
});
