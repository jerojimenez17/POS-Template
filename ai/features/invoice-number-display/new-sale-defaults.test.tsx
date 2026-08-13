import React, { useContext } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BillProvider from "../../../src/context/BillProvider";
import { BillContext } from "../../../src/context/BillContext";
import { BillReducer } from "../../../src/context/BillReducer";
import BillParametersForm from "../../../src/components/Billing/BillParametersForm";
import BillTypes from "../../../src/models/billType";
import type BillState from "../../../src/models/BillState";
import type { BillAction } from "../../../src/context/billActions";
import { getVoucherNumberAction } from "../../../src/actions/voucher";
import { parseCAE } from "../../../src/lib/cae";

vi.mock("../../../src/actions/voucher", () => ({
  getVoucherNumberAction: vi.fn(),
}));

const voucherAction = vi.mocked(getVoucherNumberAction);

beforeEach(() => {
  voucherAction.mockReset();
  class TestResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;
});

function StateProbe() {
  const { BillState, dispatch } = useContext(BillContext);
  return (
    <>
      <output data-testid="bill-type">{BillState.billType}</output>
      <button onClick={() => dispatch({ type: "billType", payload: "Remito" })}>
        choose remito
      </button>
      <button onClick={() => dispatch({ type: "removeAll", payload: null })}>
        new sale
      </button>
    </>
  );
}

function FormProbe() {
  const { onOrderResetRef } = useContext(BillContext);
  return (
    <>
      <BillParametersForm ptoVentas={[1]} />
      <button onClick={() => onOrderResetRef.current?.()}>reset parameters</button>
    </>
  );
}

function createHistoricalState(): BillState {
  return {
    id: "historic-sale",
    products: [],
    total: 100,
    totalWithDiscount: 100,
    seller: "seller@example.com",
    discount: 0,
    date: new Date("2025-01-01T00:00:00.000Z"),
    typeDocument: "DNI",
    documentNumber: 123,
    IVACondition: "Consumidor Final",
    twoMethods: false,
    paidMethod: "Efectivo",
    billType: "Remito",
    CAE: {
      CAE: "historic-cae",
      nroComprobante: 23,
      vencimiento: "31/12/2025",
      qrData: "historic-qr",
      ptoVenta: 7,
    },
  };
}

describe("new sale Factura B defaults", () => {
  it("preserves point of sale when a historical CAE is persisted and reloaded", () => {
    const persisted = JSON.parse(JSON.stringify({
      CAE: "historic-cae",
      nroComprobante: 23,
      vencimiento: "31/12/2025",
      qrData: "historic-qr",
      ptoVenta: 7,
    })) as unknown;

    expect(parseCAE(persisted)).toMatchObject({ CAE: "historic-cae", ptoVenta: 7 });
  });

  it("starts BillProvider with Factura B, as /newBill must do on first render", () => {
    render(
      <BillProvider>
        <StateProbe />
      </BillProvider>,
    );

    expect(screen.getByTestId("bill-type")).toHaveTextContent(BillTypes.B);
  });

  it("keeps Factura B after removeAll creates a new sale", async () => {
    const user = userEvent.setup();
    render(
      <BillProvider>
        <StateProbe />
      </BillProvider>,
    );

    await user.click(screen.getByRole("button", { name: "choose remito" }));
    await user.click(screen.getByRole("button", { name: "new sale" }));

    expect(screen.getByTestId("bill-type")).toHaveTextContent(BillTypes.B);
  });

  it.each(["Remito", "Presupuesto", "Factura C"])(
    "preserves an explicitly selected %s bill type",
    (billType) => {
      const state = createHistoricalState();
      const result = BillReducer(state, {
        type: "billType",
        payload: billType,
      });

      expect(result.billType).toBe(billType);
    },
  );

  it("preserves the explicit historical state and CAE when setState hydrates a sale", () => {
    const state = createHistoricalState();
    const result = BillReducer(
      { ...state, billType: BillTypes.B, CAE: undefined },
      { type: "setState", payload: state },
    );

    expect(result.billType).toBe(state.billType);
    expect(result.CAE).toEqual(state.CAE);
    expect(result.CAE?.ptoVenta).toBe(7);
    expect(result.id).toBe(state.id);
    expect(result.date).toEqual(state.date);
  });
});

describe("BillParametersForm new-sale defaults and reset", () => {
  it("renders Factura B by default and queries the next voucher as ARCA type 6", async () => {
    voucherAction.mockResolvedValue({ success: 22 });

    render(
      <BillProvider>
        <FormProbe />
      </BillProvider>,
    );

    expect(screen.getByText(BillTypes.B)).toBeInTheDocument();
    await waitFor(() => {
      expect(voucherAction).toHaveBeenCalledWith(1, 6);
    });
  });

  it("resets the form to Factura B instead of a historical/non-default type", async () => {
    const user = userEvent.setup();
    voucherAction.mockResolvedValue({ success: 22 });

    render(
      <BillProvider>
        <FormProbe />
      </BillProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByDisplayValue(BillTypes.C), {
      target: { value: BillTypes.A },
    });
    expect(screen.getByDisplayValue(BillTypes.A)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "reset parameters" }));

    await waitFor(() => {
      expect(screen.getByText(BillTypes.B)).toBeInTheDocument();
    });
    expect(screen.queryByText(BillTypes.C)).not.toBeInTheDocument();
    expect(voucherAction).toHaveBeenLastCalledWith(1, 6);
  });
});

describe("new sale and historical state boundaries", () => {
  it("does not normalize a historical Remito to Factura B through setState", () => {
    const historical = createHistoricalState();
    const action: BillAction = { type: "setState", payload: historical };

    expect(BillReducer({ ...historical, billType: BillTypes.B }, action)).toMatchObject({
      billType: "Remito",
      CAE: historical.CAE,
    });
  });
});
