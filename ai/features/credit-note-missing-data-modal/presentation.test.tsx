import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreditNoteEligibilityNotice from "@/components/Billing/CreditNoteEligibilityNotice";

describe("credit-note missing-data presentation (RED)", () => {
  it("renders an actionable recovery notice listing only missing fields", () => {
    render(React.createElement(CreditNoteEligibilityNotice, { diagnostic: { status: "INVALID_OR_INCOMPLETE", reason: "FISCAL_FIELDS_INCOMPLETE", message: "Faltan datos" }, recovery: { missingFields: ["billType"], canCompleteFromUser: true } } as never));
    expect(screen.getByText("Faltan datos del comprobante original para emitir la Nota de Crédito.")).toBeInTheDocument();
    expect(screen.getByText("Tipo de factura")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Completar datos y revisar" })).toBeInTheDocument();
    expect(screen.getByText("El CAE no puede completarse desde aquí.")).toBeInTheDocument();
  });

  it("does not render recovery CTA for non-recoverable diagnostics", () => {
    render(<CreditNoteEligibilityNotice diagnostic={{ status: "INVALID_OR_INCOMPLETE", reason: "CAE_INVALID", message: "No válido" }} />);
    expect(screen.queryByRole("button", { name: /Completar datos/i })).not.toBeInTheDocument();
  });

  it("provides an accessible modal with dynamic fields and safe copy", async () => {
    const modulePath = "@/components/Billing/CreditNoteMissingDataModal";
    const module = await import(/* @vite-ignore */ modulePath);
    const onContinue = vi.fn();
    const onCancel = vi.fn();
    render(<module.default open missingFields={["billType"]} onContinue={onContinue} onCancel={onCancel} />);
    expect(screen.getByRole("dialog", { name: "Completar datos del comprobante original" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /tipo/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/CAE/i)).not.toBeInTheDocument();
    expect(screen.getByText("El CAE original no se solicita ni se genera automáticamente.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it.each(["0", "-1", "1.5", "abc", ""])("rejects invalid numeric input %s with inline validation", async (value) => {
    const modulePath = "@/components/Billing/CreditNoteMissingDataModal";
    const module = await import(/* @vite-ignore */ modulePath);
    render(<module.default open missingFields={["invoiceNumber"]} onContinue={vi.fn()} onCancel={vi.fn()} />);
    const user = userEvent.setup();
    const input = screen.getByLabelText(/número/i);
    if (value) await user.type(input, value);
    await user.click(screen.getByRole("button", { name: "Continuar a confirmación" }));
    expect(screen.getByText("Ingresá un número entero mayor que cero")).toBeInTheDocument();
  });
});
