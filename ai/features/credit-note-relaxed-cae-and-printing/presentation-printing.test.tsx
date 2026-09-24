import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { getDocumentPrintKind } from "@/lib/print/receipt-data";

const load = async (path: string) => (await import(/* @vite-ignore */ path)) as Record<string, unknown>;
const authorized = { status: "AUTHORIZED", billType: "Nota de Crédito B", afipVoucherType: 8, cae: "79999999999999", number: 20, pointOfSale: 3, originalBillType: "Factura B", originalNumber: 42, originalPointOfSale: 7, originalCae: "HISTORICAL-CAE-0007" };

describe("AC-09..AC-12: visible association and authorized printing", () => {
  it("AC-04: asks exactly for missing original fields and never asks for CAE", async () => {
    const module = await load("@/components/Billing/CreditNoteMissingDataModal");
    const Modal = (module.CreditNoteMissingDataModal ?? module.default) as React.ComponentType<Record<string, unknown>> | undefined;
    if (!Modal) throw new Error("CreditNoteMissingDataModal export is missing");
    render(React.createElement(Modal, { open: true, missingFields: ["billType", "invoiceNumber"] }));
    expect(screen.getByLabelText(/tipo de factura/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/número/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/cae/i)).toBeNull();
    expect(screen.queryByLabelText(/punto de venta/i)).toBeNull();
  });

  it.each(["PENDING", "REJECTED"] as const)("does not offer printing for %s", async (status) => {
    const module = await load("@/components/Billing/CreditNoteStatusCard");
    const Card = (module.CreditNoteStatusCard ?? module.default) as React.ComponentType<Record<string, unknown>> | undefined;
    if (!Card) throw new Error("CreditNoteStatusCard export is missing");
    render(React.createElement(Card, { creditNote: { ...authorized, status } }));
    expect(screen.getByText(new RegExp(status === "PENDING" ? "pendiente" : "rechazada", "i"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /imprimir/i })).toBeNull();
  });

  it("shows authorized metadata and original association without conflating CAEs", async () => {
    const module = await load("@/components/Billing/CreditNoteStatusCard");
    const Card = (module.CreditNoteStatusCard ?? module.default) as React.ComponentType<Record<string, unknown>> | undefined;
    if (!Card) throw new Error("CreditNoteStatusCard export is missing");
    render(React.createElement(Card, { creditNote: authorized }));
    expect(screen.getByText(/Nota de Crédito B/i)).toBeInTheDocument();
    expect(screen.getByText(/79999999999999/)).toBeInTheDocument();
    expect(screen.getByText(/HISTORICAL-CAE-0007/)).toBeInTheDocument();
    expect(screen.getByText(/comprobante original asociado/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /imprimir/i })).toBeEnabled();
  });

  it("prints a credit-note document from the SaleReturn snapshot and has no mutation callbacks", async () => {
    const module = await load("@/lib/print/receipt-data");
    const build = module.buildCreditNotePrintContext as ((input: unknown) => Record<string, unknown>) | undefined;
    if (!build) throw new Error("buildCreditNotePrintContext export is missing");
    const context = build({ order: { total: 100, products: [{ description: "Producto", amount: 1, unitPrice: 100, subtotal: 100 }] }, creditNote: authorized });
    expect(context).toMatchObject({ documentKind: "credit-note", creditNote: { cae: "79999999999999", number: 20, pointOfSale: 3 }, original: { cae: "HISTORICAL-CAE-0007" } });
    expect(context).not.toHaveProperty("createOrder");
    expect(context).not.toHaveProperty("arcaPayload");
  });

  it("preserves the original invoice print kind and original CAE", async () => {
    const module = await load("@/lib/print/receipt-data");
    const kind = module.getDocumentPrintKind as ((cae: string, billType: string) => string) | undefined;
    if (!kind) throw new Error("getDocumentPrintKind export is missing");
    expect(kind("HISTORICAL-CAE-0007", "Factura B")).toBe("official-invoice");
  });

  it.each([
    ["Remito", undefined, "remito"],
    ["Presupuesto", undefined, "presupuesto"],
    ["Factura B", "71234567890123", "official-invoice"],
  ] as const)("AC-12: keeps existing %s print behavior", (_billType, cae, expected) => {
    expect(getDocumentPrintKind(cae, _billType)).toBe(expected);
  });
});
