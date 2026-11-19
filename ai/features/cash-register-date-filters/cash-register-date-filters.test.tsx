import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { filteredMovementsMock, legacyMovementsMock, pusherSubscribeMock, pusherUnsubscribeMock, totalPanelMock } = vi.hoisted(() => {
  const channel = { bind: vi.fn() };
  return {
    filteredMovementsMock: vi.fn(),
    legacyMovementsMock: vi.fn(),
    pusherSubscribeMock: vi.fn((_channelName: string) => channel),
    pusherUnsubscribeMock: vi.fn(),
    totalPanelMock: vi.fn(),
  };
});

vi.mock("@/actions/movements", () => ({
  getFilteredMovements: filteredMovementsMock,
  getMovements: legacyMovementsMock,
}));
vi.mock("@/lib/pusher-client", () => ({
  pusherClient: { subscribe: pusherSubscribeMock, unsubscribe: pusherUnsubscribeMock },
}));
vi.mock("@/components/TotalPanel", () => ({ default: (props: { refreshCount: number }) => {
  totalPanelMock(props);
  return <section aria-label="Balance en Efectivo Actual">Balance en Efectivo Actual</section>;
} }));

import CashRegister from "@/components/CashRegister";

const cashResult = (id: string, amount: number, total = amount) => ({
  success: true,
  movements: [{
    id,
    total: amount,
    seller: "cajero@example.test",
    paidMethod: "Efectivo",
    date: new Date("2026-05-10T12:00:00.000Z"),
  }],
  total,
});

const session = { user: { businessId: "business-a" } } as never;

describe("CashRegister historical movement filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    filteredMovementsMock.mockResolvedValue({ success: true, movements: [], total: 0 });
    legacyMovementsMock.mockResolvedValue([]);
    pusherSubscribeMock.mockReturnValue({ bind: vi.fn() });
  });

  it("starts with empty inclusive date limits and the accessible Solo efectivo method selected", async () => {
    render(<CashRegister session={session} />);

    expect(screen.getByLabelText("Desde")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("Hasta")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("Desde")).toHaveValue("");
    expect(screen.getByLabelText("Hasta")).toHaveValue("");
    expect(screen.getByRole("radio", { name: "Solo efectivo" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Todos los medios de pago" })).toHaveAttribute("aria-checked", "false");
    await waitFor(() => expect(filteredMovementsMock).toHaveBeenCalledWith({
      fromDate: "",
      toDate: "",
      paymentMethod: "CASH",
    }));
  });

  it("loads list and filtered subtotal together after a date or method change", async () => {
    filteredMovementsMock
      .mockResolvedValueOnce({ success: true, movements: [], total: 0 })
      .mockResolvedValueOnce(cashResult("cash-1", 11, 11))
      .mockResolvedValueOnce({
        success: true,
        movements: [{ ...cashResult("card-1", 18).movements[0], paidMethod: "Tarjeta" }],
        total: 18,
      });
    render(<CashRegister session={session} />);

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-05-10" } });
    await screen.findByText("cajero");
    expect(filteredMovementsMock).toHaveBeenLastCalledWith({
      fromDate: "2026-05-10",
      toDate: "",
      paymentMethod: "CASH",
    });
    expect(screen.getByText(/Total de movimientos filtrados \(neto\)/i)).toBeInTheDocument();
    expect(screen.getByText(/\$\s*11/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Todos los medios de pago" }));
    await waitFor(() => expect(filteredMovementsMock).toHaveBeenLastCalledWith({
      fromDate: "2026-05-10",
      toDate: "",
      paymentMethod: "ALL",
    }));
    expect(await screen.findByText("Tarjeta")).toBeInTheDocument();
    expect(screen.getByText(/\$\s*18/)).toBeInTheDocument();
  });

  it("does not let a slower previous filter response overwrite the latest result", async () => {
    let resolveOld: ((value: unknown) => void) | undefined;
    filteredMovementsMock
      .mockResolvedValueOnce({ success: true, movements: [], total: 0 })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(cashResult("new-filter", 25, 25));
    render(<CashRegister session={session} />);

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-05-01" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-05-12" } });
    expect(await screen.findByText("cajero")).toBeInTheDocument();
    expect(screen.getByText(/\$\s*25/)).toBeInTheDocument();

    await act(async () => {
      resolveOld?.(cashResult("old-filter", 4, 4));
    });
    expect(screen.queryByText(/\$\s*4\b/)).not.toBeInTheDocument();
    expect(screen.getByText(/\$\s*25/)).toBeInTheDocument();
  });

  it("reports invalid date order accessibly without requesting a partial range", async () => {
    render(<CashRegister session={session} />);
    const initialCalls = filteredMovementsMock.mock.calls.length;

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-05-12" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-05-10" } });

    expect(await screen.findByRole("alert")).toHaveTextContent(/Desde.*Hasta|anterior/i);
    expect(filteredMovementsMock).toHaveBeenCalledTimes(initialCalls + 1);
  });

  it("announces loading, renders an explicit empty zero, and offers retry on read error", async () => {
    let resolveInitial: ((value: unknown) => void) | undefined;
    filteredMovementsMock
      .mockImplementationOnce(() => new Promise((resolve) => { resolveInitial = resolve; }))
      .mockResolvedValueOnce({ success: false, error: "No se pudo cargar el historial" })
      .mockResolvedValueOnce(cashResult("retry-row", 10, 10));
    render(<CashRegister session={session} />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    await act(async () => {
      resolveInitial?.({ success: true, movements: [], total: 0 });
    });
    await screen.findByText(/No hay movimientos para los filtros seleccionados/i);
    expect(screen.getByText(/\$\s*0\b/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Todos los medios de pago" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/No se pudo cargar el historial/i);
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(await screen.findByText("cajero")).toBeInTheDocument();
  });

  it("preserves the last complete rows and subtotal when a subsequent read fails", async () => {
    filteredMovementsMock
      .mockResolvedValueOnce(cashResult("loaded-before-error", 12, 12))
      .mockResolvedValueOnce({ success: false, error: "No se pudo cargar el historial" });
    render(<CashRegister session={session} />);
    expect(await screen.findByText("cajero")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Todos los medios de pago" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/No se pudo cargar el historial/i);
    expect(screen.getByText("cajero")).toBeInTheDocument();
    expect(screen.getByText(/\$\s*12\b/)).toBeInTheDocument();
  });

  it("rounds every visible signed row to whole pesos and keeps the subtotal equal to visible rows", async () => {
    filteredMovementsMock.mockResolvedValueOnce({
      success: true,
      movements: [
        { ...cashResult("a", 10.49).movements[0], total: 10.49 },
        { ...cashResult("b", 10.5).movements[0], total: 10.5 },
        { ...cashResult("c", -2.5).movements[0], total: -2.5 },
      ],
      total: 18,
    });

    render(<CashRegister session={session} />);

    expect(await screen.findByText(/\$\s*18\b/)).toBeInTheDocument();
    expect(screen.getByText(/\+\s*\$\s*10\b/)).toBeInTheDocument();
    expect(screen.getByText(/\+\s*\$\s*11\b/)).toBeInTheDocument();
    expect(screen.getByText(/-\s*\$\s*3\b/)).toBeInTheDocument();
    expect(screen.queryByText(/10,49|10,50|2,50/)).not.toBeInTheDocument();
  });

  it("re-queries active filters for Pusher events without resubscribing on filter changes", async () => {
    const bind = vi.fn();
    pusherSubscribeMock.mockReturnValue({ bind });
    render(<CashRegister session={session} />);
    await waitFor(() => expect(filteredMovementsMock).toHaveBeenCalledTimes(1));
    expect(pusherSubscribeMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-05-10" } });
    await waitFor(() => expect(filteredMovementsMock).toHaveBeenCalledTimes(2));
    expect(pusherSubscribeMock).toHaveBeenCalledTimes(1);
    expect(bind).toHaveBeenCalledWith("new-movement", expect.any(Function));
    expect(bind).toHaveBeenCalledTimes(1);

    const listener = bind.mock.calls[0][1] as (movement: unknown) => void;
    await act(async () => listener({ id: "pusher-row", total: 1, date: new Date(), paidMethod: "Efectivo" }));
    await waitFor(() => expect(filteredMovementsMock).toHaveBeenCalledTimes(3));
    expect(filteredMovementsMock).toHaveBeenLastCalledWith({
      fromDate: "2026-05-10",
      toDate: "",
      paymentMethod: "CASH",
    });
  });

  it("starts a fresh same-filter Pusher read and ignores the older in-flight response", async () => {
    const pendingReads: Array<(value: unknown) => void> = [];
    filteredMovementsMock.mockImplementation(() => new Promise((resolve) => {
      pendingReads.push(resolve);
    }));
    const bind = vi.fn();
    pusherSubscribeMock.mockReturnValue({ bind });

    render(<CashRegister session={session} />);
    await waitFor(() => expect(filteredMovementsMock).toHaveBeenCalledTimes(1));
    expect(pendingReads).toHaveLength(1);

    const listener = bind.mock.calls[0][1] as (movement: unknown) => void;
    await act(async () => {
      listener({ id: "pusher-row", total: 1, date: new Date(), paidMethod: "Efectivo" });
    });

    const eventReadCount = filteredMovementsMock.mock.calls.length;
    const latestResult = {
      success: true,
      movements: [
        { ...cashResult("event-first", 12).movements[0], seller: "event-first@example.test" },
        { ...cashResult("event-second", 21).movements[0], seller: "event-second@example.test" },
      ],
      total: 33,
    };
    const staleResult = cashResult("old-request", 4, 4);

    if (pendingReads.length > 1) {
      await act(async () => {
        pendingReads[1](latestResult);
      });
      await screen.findByText("event-first");
      await act(async () => {
        pendingReads[0](staleResult);
      });
    } else {
      // Resolve the shared in-flight read so the failing regression stays deterministic.
      await act(async () => {
        pendingReads[0](staleResult);
      });
    }

    expect(eventReadCount).toBe(2);
    expect(filteredMovementsMock).toHaveBeenNthCalledWith(1, {
      fromDate: "",
      toDate: "",
      paymentMethod: "CASH",
    });
    expect(filteredMovementsMock).toHaveBeenNthCalledWith(2, {
      fromDate: "",
      toDate: "",
      paymentMethod: "CASH",
    });
    expect(screen.getByText("event-first")).toBeInTheDocument();
    expect(screen.getByText("event-second")).toBeInTheDocument();
    expect(screen.getByText(/\$\s*33\b/)).toBeInTheDocument();
    expect(screen.queryByText("old-request")).not.toBeInTheDocument();
  });

  it("clears the previous business history, reloads on a session business change, and ignores stale reads", async () => {
    let resolveBusinessARead: ((value: unknown) => void) | undefined;
    const initialBusinessAResult = cashResult("business-a-initial", 101, 101);
    initialBusinessAResult.movements[0].seller = "business-a-cashier@example.test";
    const staleBusinessAResult = cashResult("business-a-stale", 303, 303);
    staleBusinessAResult.movements[0].seller = "stale-business-a-cashier@example.test";
    const businessBResult = cashResult("business-b-row", 202, 202);
    businessBResult.movements[0].seller = "business-b-cashier@example.test";

    filteredMovementsMock
      .mockResolvedValueOnce(initialBusinessAResult)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveBusinessARead = resolve; }))
      .mockResolvedValueOnce(businessBResult);

    const bindBusinessA = vi.fn();
    const bindBusinessB = vi.fn();
    pusherSubscribeMock
      .mockReturnValueOnce({ bind: bindBusinessA })
      .mockReturnValueOnce({ bind: bindBusinessB });

    const { rerender } = render(<CashRegister session={session} />);
    expect(await screen.findByText("business-a-cashier")).toBeInTheDocument();
    const businessATotal = screen.getByText(/Total de movimientos filtrados \(neto\)/i).parentElement;
    expect(businessATotal).toHaveTextContent(/101/);

    const businessAListener = bindBusinessA.mock.calls[0][1] as (movement: unknown) => void;
    await act(async () => {
      businessAListener({ id: "pending-business-a", total: 1, date: new Date(), paidMethod: "Efectivo" });
    });

    rerender(<CashRegister session={{ user: { businessId: "business-b" } } as never} />);
    const oldBusinessClearedImmediately =
      screen.queryByText("business-a-cashier") === null &&
      !((screen.getByText(/Total de movimientos filtrados \(neto\)/i).parentElement?.textContent ?? "").includes("101"));

    // Let the new-session effect and any already-resolved business-B read run,
    // without waiting on an assertion that would short-circuit the stale-read check.
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      resolveBusinessARead?.(staleBusinessAResult);
    });

    const expectedFilters = { fromDate: "", toDate: "", paymentMethod: "CASH" };
    const businessBReadUsesOnlyFilters =
      filteredMovementsMock.mock.calls.length === 3 &&
      JSON.stringify(filteredMovementsMock.mock.calls[2][0]) === JSON.stringify(expectedFilters);
    const businessBResultVisible =
      screen.queryByText("business-b-cashier") !== null &&
      (screen.getByText(/Total de movimientos filtrados \(neto\)/i).parentElement?.textContent ?? "").includes("202");
    const staleBusinessAResultIgnored = screen.queryByText("stale-business-a-cashier") === null;
    const pusherLifecyclePreserved =
      pusherUnsubscribeMock.mock.calls.some(([channel]) => channel === "movements-business-a") &&
      pusherSubscribeMock.mock.calls.length === 2 &&
      pusherSubscribeMock.mock.calls[0][0] === "movements-business-a" &&
      pusherSubscribeMock.mock.calls[1][0] === "movements-business-b" &&
      bindBusinessA.mock.calls.length === 1 &&
      bindBusinessB.mock.calls.length === 1;

    expect({
      oldBusinessClearedImmediately,
      businessBReadUsesOnlyFilters,
      businessBResultVisible,
      staleBusinessAResultIgnored,
      pusherLifecyclePreserved,
    }).toEqual({
      oldBusinessClearedImmediately: true,
      businessBReadUsesOnlyFilters: true,
      businessBResultVisible: true,
      staleBusinessAResultIgnored: true,
      pusherLifecyclePreserved: true,
    });
  });

  it("keeps TotalPanel balance semantics and refresh prop independent from history filters", async () => {
    render(<CashRegister session={session} />);
    expect(screen.getByRole("region", { name: "Balance en Efectivo Actual" })).toBeInTheDocument();
    expect(totalPanelMock).toHaveBeenCalledWith(expect.objectContaining({ refreshCount: 0 }));
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-05-10" } });
    await waitFor(() => expect(filteredMovementsMock).toHaveBeenCalledTimes(2));
    expect(totalPanelMock).toHaveBeenLastCalledWith(expect.objectContaining({ refreshCount: 0 }));
  });
});
