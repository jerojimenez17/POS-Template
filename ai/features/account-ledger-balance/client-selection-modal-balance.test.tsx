import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ClientSelectionModal from "@/components/ledger/ClientSelectionModal";

const { getClientUnpaidOrdersMock, addItemsToOrderMock, createClientMock } = vi.hoisted(() => ({
  getClientUnpaidOrdersMock: vi.fn(),
  addItemsToOrderMock: vi.fn(),
  createClientMock: vi.fn(),
}));

vi.mock("@/actions/unpaid-orders", () => ({
  getClientUnpaidOrders: getClientUnpaidOrdersMock,
  addItemsToOrder: addItemsToOrderMock,
}));
vi.mock("@/actions/clients", () => ({ createClient: createClientMock }));

const clients = [
  { id: "client-debt", name: "Ana Deuda", balance: 1250.5 },
  { id: "client-zero", name: "Beto Saldado", balance: 0 },
  { id: "client-credit", name: "Cora Crédito", balance: -250.75 },
];

const expectedBalanceLabel = (balance: number) => `Saldo: $${balance.toLocaleString("es-AR")}`;
const existingOrder = {
  id: "order-123456",
  total: 9876.5,
  date: new Date("2026-01-15T10:00:00Z"),
  itemsCount: 1,
  status: "inpago",
  paidStatus: "inpago",
};

function renderModal(mode: "unpaid" | "budget") {
  return render(
    <ClientSelectionModal
      open
      onOpenChange={vi.fn()}
      items={[]}
      total={0}
      businessId="business-a"
      mode={mode}
    />,
  );
}

function clientOptionText(name: string): string {
  const nameElement = screen.getByText(name);
  const option = nameElement.parentElement?.parentElement;
  if (!option) throw new Error(`Client option container not found for ${name}`);
  return option.textContent ?? "";
}

function getExistingOrderBalanceLabel(dialog: HTMLElement): HTMLElement {
  const label = within(dialog).queryByText("Saldo actual del cliente");
  expect(label).not.toBeNull();
  if (!label) throw new Error("Existing Order Dialog balance label is missing");
  return label;
}

describe("ClientSelectionModal current balance rendering", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getClientUnpaidOrdersMock.mockResolvedValue({ success: true, data: [] });
    addItemsToOrderMock.mockResolvedValue({ success: true });
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/clients") {
        return { ok: true, json: async () => ({ clients }) };
      }
      return { ok: true, json: async () => ({ orders: [] }) };
    });
  });

  it.each(["unpaid", "budget"] as const)(
    "renders formatted positive, zero and negative balances in %s mode",
    async (mode) => {
      renderModal(mode);

      await screen.findByText("Ana Deuda");
      expect(clientOptionText("Ana Deuda")).toContain(expectedBalanceLabel(1250.5));
      expect(clientOptionText("Beto Saldado")).toContain(expectedBalanceLabel(0));
      expect(clientOptionText("Cora Crédito")).toContain(expectedBalanceLabel(-250.75));
      expect(clientOptionText("Cora Crédito")).toContain("-");
    },
  );

  it.each(["unpaid", "budget"] as const)(
    "keeps each filtered and selected client's balance associated with its identity in %s mode",
    async (mode) => {
      renderModal(mode);
      await screen.findByText("Ana Deuda");

      fireEvent.change(screen.getByPlaceholderText("Buscar cliente..."), { target: { value: "Cora" } });
      await waitFor(() => expect(screen.queryByText("Ana Deuda")).not.toBeInTheDocument());
      expect(clientOptionText("Cora Crédito")).toContain(expectedBalanceLabel(-250.75));

      fireEvent.click(screen.getByText("Cora Crédito"));
      await waitFor(() => expect(getClientUnpaidOrdersMock).toHaveBeenCalledWith("client-credit"));
      expect(clientOptionText("Cora Crédito")).toContain(expectedBalanceLabel(-250.75));
      expect(screen.queryByText("Ana Deuda")).not.toBeInTheDocument();
      expect(screen.queryByText("Beto Saldado")).not.toBeInTheDocument();
    },
  );

  it.each([
    {
      description: "missing balance",
      client: { id: "client-missing-balance", name: "Dina Sin Saldo" },
    },
    {
      description: "non-numeric balance",
      client: {
        id: "client-invalid-balance",
        name: "Ema Saldo Inválido",
        balance: "1250" as unknown,
      },
    },
  ])(
    "keeps a client selectable, shows a placeholder, and reports a $description from /api/clients",
    async ({ client }) => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ clients: [client] }),
      });

      renderModal("unpaid");

      await screen.findByText(client.name);
      expect(clientOptionText(client.name)).toContain("Saldo: —");
      expect(clientOptionText(client.name)).not.toContain("$0");

      fireEvent.click(screen.getByText(client.name));
      await waitFor(() => {
        expect(getClientUnpaidOrdersMock).toHaveBeenCalledWith(client.id);
      });

      const reportedInvalidBalance = consoleError.mock.calls.some((args) => {
        const report = args
          .map((argument) =>
            typeof argument === "string" ? argument : JSON.stringify(argument),
          )
          .join(" ");
        return /balance/i.test(report) && report.includes(client.id);
      });
      expect(reportedInvalidBalance).toBe(true);
    },
  );

  it("shows the selected client's current balance before existing orders, not order or add totals", async () => {
    getClientUnpaidOrdersMock.mockResolvedValue({ success: true, data: [existingOrder] });

    render(
      <ClientSelectionModal
        open
        onOpenChange={vi.fn()}
        items={[]}
        total={250}
        businessId="business-a"
      />,
    );
    await screen.findByText("Ana Deuda");
    fireEvent.click(screen.getByText("Ana Deuda"));

    const orderDialog = await screen.findByRole("dialog", { name: "Orden Pendiente Existente" });
    const balanceLabel = getExistingOrderBalanceLabel(orderDialog);
    expect(balanceLabel.parentElement?.textContent).toContain("$1.250,5");
    expect(balanceLabel.parentElement?.textContent).not.toContain("$9.876,5");
    expect(balanceLabel.parentElement?.textContent).not.toContain("$250");
    const dialogText = orderDialog.textContent ?? "";
    expect(dialogText.indexOf("Saldo actual del cliente")).toBeLessThan(
      dialogText.indexOf("Orden #123456"),
    );
    expect(within(orderDialog).getByText("Total a agregar:")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith("/api/clients");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    { mode: "unpaid" as const, pickerTitle: "Crear Orden a Cuenta" },
    { mode: "budget" as const, pickerTitle: "Crear Presupuesto" },
  ])(
    "widens only the Existing Order Dialog at md in $mode mode",
    async ({ mode, pickerTitle }) => {
      getClientUnpaidOrdersMock.mockResolvedValue({ success: true, data: [existingOrder] });

      renderModal(mode);

      const clientPickerDialog = await screen.findByRole("dialog", { name: pickerTitle });
      expect(clientPickerDialog).toHaveClass("w-[calc(100%-1rem)]", "sm:max-w-md");
      expect(clientPickerDialog).not.toHaveClass("md:max-w-2xl");

      await screen.findByText("Ana Deuda");
      fireEvent.click(screen.getByText("Ana Deuda"));

      const existingOrderDialog = await screen.findByRole("dialog", {
        name: "Orden Pendiente Existente",
      });
      expect(existingOrderDialog).toHaveClass(
        "w-[calc(100%-1rem)]",
        "sm:max-w-md",
        "md:max-w-2xl",
      );
      expect(clientPickerDialog).not.toHaveClass("md:max-w-2xl");
    },
  );

  it.each([
    { id: "client-debt", name: "Ana Deuda", balance: 1250.5, expected: "$1.250,5" },
    { id: "client-zero", name: "Beto Saldado", balance: 0, expected: "$0" },
    { id: "client-credit", name: "Cora Crédito", balance: -250.75, expected: "$-250,75" },
  ])("shows the selected client $name balance in the existing order dialog", async (client) => {
    getClientUnpaidOrdersMock.mockResolvedValue({ success: true, data: [existingOrder] });

    renderModal("unpaid");
    await screen.findByText(client.name);
    fireEvent.click(screen.getByText(client.name));

    const orderDialog = await screen.findByRole("dialog", { name: "Orden Pendiente Existente" });
    const balanceLabel = getExistingOrderBalanceLabel(orderDialog);
    expect(balanceLabel.parentElement?.textContent).toContain(client.expected);
  });

  it.each([
    { id: "client-no-balance", name: "Dina Sin Saldo" },
    { id: "client-invalid-balance", name: "Ema Saldo Inválido", balance: Number.NaN },
  ])("shows an unavailable balance as a dash for $name without blocking the order flow", async (client) => {
    getClientUnpaidOrdersMock.mockResolvedValue({ success: true, data: [existingOrder] });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ clients: [client] }),
    });

    renderModal("unpaid");
    await screen.findByText(client.name);
    fireEvent.click(screen.getByText(client.name));

    const orderDialog = await screen.findByRole("dialog", { name: "Orden Pendiente Existente" });
    const balanceLabel = getExistingOrderBalanceLabel(orderDialog);
    expect(balanceLabel.parentElement?.textContent).toContain("—");
    expect(balanceLabel.parentElement?.textContent).not.toContain("$0");
    expect(within(orderDialog).getByRole("button", { name: "Agregar a orden existente" })).toBeEnabled();
  });

  it("updates the dialog balance when selection changes instead of retaining the previous client's balance", async () => {
    getClientUnpaidOrdersMock.mockResolvedValue({ success: true, data: [existingOrder] });

    renderModal("unpaid");
    await screen.findByText("Ana Deuda");
    fireEvent.click(screen.getByText("Ana Deuda"));
    const firstDialog = await screen.findByRole("dialog", { name: "Orden Pendiente Existente" });
    const firstBalanceLabel = getExistingOrderBalanceLabel(firstDialog);
    expect(firstBalanceLabel.parentElement?.textContent).toContain("$1.250,5");

    fireEvent.click(within(firstDialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(firstDialog).not.toBeInTheDocument());
    fireEvent.click(screen.getByText("Cora Crédito"));

    const secondDialog = await screen.findByRole("dialog", { name: "Orden Pendiente Existente" });
    const secondBalanceLabel = getExistingOrderBalanceLabel(secondDialog);
    expect(secondBalanceLabel.parentElement?.textContent).toContain("$-250,75");
    expect(secondBalanceLabel.parentElement?.textContent).not.toContain("$1.250,5");
  });

  it("keeps add-to-existing-order mutation payload limited to orderId, businessId and items", async () => {
    getClientUnpaidOrdersMock.mockResolvedValue({ success: true, data: [existingOrder] });
    const items = [{ id: "product-1", code: "P-1", description: "Producto", salePrice: 100, amount: 2 }];

    render(
      <ClientSelectionModal
        open
        onOpenChange={vi.fn()}
        items={items}
        total={200}
        businessId="business-a"
      />,
    );
    await screen.findByText("Ana Deuda");
    fireEvent.click(screen.getByText("Ana Deuda"));

    const orderDialog = await screen.findByRole("dialog", { name: "Orden Pendiente Existente" });
    fireEvent.click(within(orderDialog).getByRole("button", { name: "Agregar a orden existente" }));

    await waitFor(() => {
      expect(addItemsToOrderMock).toHaveBeenCalledWith({
        orderId: "order-123456",
        businessId: "business-a",
        items: [{
          productId: "product-1",
          code: "P-1",
          description: "Producto",
          price: 100,
          quantity: 2,
          subTotal: 200,
        }],
      });
    });
    expect(Object.keys(addItemsToOrderMock.mock.calls[0][0]).sort()).toEqual([
      "businessId",
      "items",
      "orderId",
    ]);
  });
});
