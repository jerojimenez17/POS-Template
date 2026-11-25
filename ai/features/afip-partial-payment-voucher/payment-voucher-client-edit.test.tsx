import { createElement } from "react";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

declare global {
  interface ImportMeta {
    glob: <Module>(pattern: string) => Record<string, () => Promise<Module>>;
  }
}

interface ClientFiscalData {
  id: string;
  name: string;
  address: string;
  cellPhone: string;
  cuit: string;
  ivaCondition: string;
  email: string;
  fiscalDocumentType: "CUIT" | "DNI" | null;
  fiscalDocumentNumber: string | null;
}

interface ClientEditDialogProps {
  client: ClientFiscalData;
  onSave: (input: Record<string, string>) => Promise<void>;
}

async function loadClientEditDialog(): Promise<(props: ClientEditDialogProps) => React.ReactNode> {
  const loaders = import.meta.glob<{
    PaymentVoucherClientEditDialog: (props: ClientEditDialogProps) => React.ReactNode;
  }>("/src/components/account-ledger/PaymentVoucherClientEditDialog.tsx");
  const load = Object.values(loaders)[0];
  if (!load) throw new Error("Expected the payment-voucher Client edit dialog to be implemented");
  const loadedModule = await load();
  return loadedModule.PaymentVoucherClientEditDialog;
}

const savedConsumerFinalClient: ClientFiscalData = {
  id: "client-1",
  name: "María Cliente",
  address: "Calle 123",
  cellPhone: "011-4444-5555",
  cuit: "20123456789",
  ivaCondition: "Consumidor Final",
  email: "maria@example.test",
  fiscalDocumentType: "CUIT",
  fiscalDocumentNumber: "20123456789",
};

describe("payment-voucher persistent Client fiscal-data dialog", () => {
  it("opens a populated accessible edit dialog with the saved IVA and fiscal identity", async () => {
    const PaymentVoucherClientEditDialog = await loadClientEditDialog();
    render(createElement(PaymentVoucherClientEditDialog, {
      client: savedConsumerFinalClient,
      onSave: vi.fn().mockResolvedValue(undefined),
    }));

    fireEvent.click(screen.getByRole("button", { name: /editar datos fiscales del cliente/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre/i)).toHaveValue("María Cliente");
    expect(screen.getByLabelText(/condición.*iva/i)).toHaveValue("Consumidor Final");
    expect(screen.getByLabelText(/número.*documento|documento/i)).toHaveValue("20123456789");
    expect(screen.getByRole("radio", { name: /cuit/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /dni/i })).toBeInTheDocument();
  });

  it("loads a legacy-only cuit into the populated modal as a CUIT identity", async () => {
    const PaymentVoucherClientEditDialog = await loadClientEditDialog();
    render(createElement(PaymentVoucherClientEditDialog, {
      client: {
        ...savedConsumerFinalClient,
        cuit: "27123456780",
        fiscalDocumentType: null,
        fiscalDocumentNumber: null,
      },
      onSave: vi.fn().mockResolvedValue(undefined),
    }));

    fireEvent.click(screen.getByRole("button", { name: /editar datos fiscales del cliente/i }));

    expect(screen.getByRole("radio", { name: /cuit/i })).toBeChecked();
    expect(screen.getByLabelText(/número.*documento|documento/i)).toHaveValue("27123456780");
  });

  it("allows one Factura A DNI pair for a saved Consumidor Final Client and preserves leading zeroes", async () => {
    const PaymentVoucherClientEditDialog = await loadClientEditDialog();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(createElement(PaymentVoucherClientEditDialog, {
      client: { ...savedConsumerFinalClient, fiscalDocumentType: null, fiscalDocumentNumber: null },
      onSave,
    }));

    fireEvent.click(screen.getByRole("button", { name: /editar datos fiscales del cliente/i }));
    expect(screen.getByLabelText(/condición.*iva/i)).toHaveValue("Consumidor Final");
    fireEvent.click(screen.getByRole("radio", { name: /dni/i }));
    fireEvent.change(screen.getByLabelText(/número.*documento|documento/i), { target: { value: "00123456" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      id: "client-1",
      ivaCondition: "Consumidor Final",
      fiscalDocumentType: "DNI",
      fiscalDocumentNumber: "00123456",
    })));
    const submitted = onSave.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(submitted.fiscalDocumentNumber).toBe("00123456");
    expect(submitted).not.toHaveProperty("dni");
    expect(submitted).not.toHaveProperty("cuitNumber");
  });

  it("clears the saved CUIT number immediately when switching to DNI and requires a new number before save", async () => {
    const PaymentVoucherClientEditDialog = await loadClientEditDialog();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(createElement(PaymentVoucherClientEditDialog, { client: savedConsumerFinalClient, onSave }));

    fireEvent.click(screen.getByRole("button", { name: /editar datos fiscales del cliente/i }));
    const documentNumber = screen.getByLabelText(/número.*documento|documento/i);
    expect(documentNumber).toHaveValue("20123456789");
    fireEvent.click(screen.getByRole("radio", { name: /dni/i }));

    expect(documentNumber).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/tipo e ingrese el número/i);

    fireEvent.change(documentNumber, { target: { value: "00123456" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      fiscalDocumentType: "DNI",
      fiscalDocumentNumber: "00123456",
    })));
  });

  it("also clears the saved DNI number immediately when switching to CUIT", async () => {
    const PaymentVoucherClientEditDialog = await loadClientEditDialog();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(createElement(PaymentVoucherClientEditDialog, {
      client: { ...savedConsumerFinalClient, fiscalDocumentType: "DNI", fiscalDocumentNumber: "00123456" },
      onSave,
    }));

    fireEvent.click(screen.getByRole("button", { name: /editar datos fiscales del cliente/i }));
    const documentNumber = screen.getByLabelText(/número.*documento|documento/i);
    fireEvent.click(screen.getByRole("radio", { name: /cuit/i }));

    expect(documentNumber).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("clears identity only as an atomic absent type-and-number pair", async () => {
    const PaymentVoucherClientEditDialog = await loadClientEditDialog();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(createElement(PaymentVoucherClientEditDialog, { client: savedConsumerFinalClient, onSave }));

    fireEvent.click(screen.getByRole("button", { name: /editar datos fiscales del cliente/i }));
    fireEvent.click(screen.getByRole("button", { name: /quitar identidad/i }));
    expect(screen.getByLabelText(/número.*documento|documento/i)).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      fiscalDocumentType: "",
      fiscalDocumentNumber: "",
    })));
  });
});
