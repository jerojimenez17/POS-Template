import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SaleHistory from "@/components/Billing/SaleHistory";

const { getSaleHistoryMock } = vi.hoisted(() => ({ getSaleHistoryMock: vi.fn() }));
vi.mock("@/actions/sales/get-sale-history", () => ({ getSaleHistoryAction: getSaleHistoryMock }));

const componentSource = readFileSync(resolve(process.cwd(), "src/components/Billing/SaleHistory.tsx"), "utf8");

describe("SaleHistory request states", () => {
  beforeEach(() => vi.clearAllMocks());

  it("imports only the dedicated action path and has no server-only runtime imports", () => {
    expect(componentSource).toContain('from "@/actions/sales/get-sale-history"');
    expect(componentSource).not.toContain('from "@/actions/sales"');
    expect(componentSource).not.toMatch(/from\s+["']@\/auth|from\s+["']@\/lib\/db/);
  });

  it.each([
    ["a non-empty result", Promise.resolve([{ id: "history-1", date: new Date(), updatedBy: { name: "Ana", email: "ana@example.com" }, version: 1, type: "STATUS_CHANGED", changes: { type: "STATUS_CHANGED", from: "a", to: "b" }, message: null }])],
    ["an empty result", Promise.resolve([])],
  ])("clears loading after %s", async (_label, result) => {
    getSaleHistoryMock.mockReturnValueOnce(result);
    render(<SaleHistory saleId="sale-1" />);
    await waitFor(() => expect(document.querySelector(".animate-spin")).not.toBeInTheDocument());
    if (result === undefined) return;
    if (Array.isArray(await result) && (await result).length === 0) {
      expect(screen.getByText(/no hay historial/i)).toBeVisible();
    } else {
      expect(screen.getByText(/historial de modificaciones/i)).toBeVisible();
    }
  });

  it("hides change cards when the stored values are equivalent", async () => {
    getSaleHistoryMock.mockResolvedValueOnce([{
      id: "history-equivalent",
      date: new Date(),
      updatedBy: { name: "Ana", email: "ana@example.com" },
      version: 2,
      type: "ITEMS_UPDATED",
      message: null,
      changes: {
        type: "ITEMS_UPDATED",
        items: [
          { productId: "product-1", description: "Producto 1", code: "P1", quantity: { from: 1, to: 1 } },
        ],
        billTypeChanged: { from: "Factura B", to: "Factura B" },
        ivaChanged: {
          from: { condition: "Consumidor Final", documentNumber: null },
          to: { condition: "Consumidor Final", documentNumber: "0" },
        },
        paymentChanged: {
          from: { method: "Efectivo", twoMethods: true, secondMethod: "Débito", firstAmount: 100, secondAmount: 50 },
          to: { method: "Efectivo", twoMethods: true, secondMethod: "Débito", firstAmount: 100, secondAmount: 50 },
        },
        discountChanged: { from: 5, to: 5 },
      },
    }]);

    render(<SaleHistory saleId="sale-1" />);

    expect(await screen.findByText(/historial de modificaciones/i)).toBeVisible();
    expect(screen.queryByText(/Productos Actualizados/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tipo comprobante actualizado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Condición IVA actualizada/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pago actualizado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Descuento actualizado/i)).not.toBeInTheDocument();
  });

  it("clears loading and visibly reports a rejected Error", async () => {
    getSaleHistoryMock.mockRejectedValueOnce(new Error("No autorizado"));
    render(<SaleHistory saleId="sale-1" />);
    expect(await screen.findByText(/no autorizado/i)).toBeVisible();
    expect(document.querySelector(".animate-spin")).not.toBeInTheDocument();
  });

  it("clears loading and visibly reports a non-Error thrown value", async () => {
    getSaleHistoryMock.mockRejectedValueOnce("request failed");
    render(<SaleHistory saleId="sale-1" />);
    expect(await screen.findByText(/error/i)).toBeVisible();
    expect(screen.queryByText(/no hay historial/i)).not.toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).not.toBeInTheDocument();
  });
});
