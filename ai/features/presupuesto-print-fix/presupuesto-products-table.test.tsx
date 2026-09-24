// @vitest-environment jsdom
/**
 * AC2 + R1 + R3 — Snapshot propagation: ProductsTable.handlePrint -> PrintableTable.printSnapshot
 * Also covers AC10 historical presupuesto (PrintOrderButton style) via externalState parity.
 *
 * These tests MUST FAIL before fix:
 * - ProductsTable.handlePrint currently ignores snapshot (2 args) and does not forward to PrintableTable
 * - PrintableTable does not accept printSnapshot, so Presupuesto snapshot is lost after resetCheckout
 * - PrintableTable billTypeDisplay ignores billType Presupuesto when CAE is null (shows Remito)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import * as fs from "fs";
import * as path from "path";
import { createBillCheckoutSnapshot } from "@/utils/billing";
import type BillState from "@/models/BillState";

// Top-level mocks so PrintableTable module loads in jsdom without next/font error
vi.mock("next/font/google", () => ({
  Inter: () => ({ className: "inter-mock", variable: "--font-inter" }),
}));
vi.mock("qrcode.react", () => ({
  QRCodeSVG: () => null,
}));
vi.mock("qrcode", () => ({
  default: { toString: () => Promise.resolve("<svg></svg>"), toDataURL: () => Promise.resolve("data:image/png;base64,xxx") },
  toString: () => Promise.resolve("<svg></svg>"),
  toDataURL: () => Promise.resolve("data:image/png;base64,xxx"),
}));
vi.mock("@/actions/business", () => ({
  getBusinessBillingInfoAction: vi.fn().mockResolvedValue(null),
}));

// ---------------------------------------------------------------------------
// AC2 — contract: source-files must forward snapshot
// ---------------------------------------------------------------------------
describe("ProductsTable/PrintableTable snapshot contract — AC2 R1 R3", () => {
  const productsTablePath = path.resolve(process.cwd(), "src/components/Billing/ProductsTable.tsx");
  const printableTablePath = path.resolve(process.cwd(), "src/components/Billing/PrintableTable.tsx");

  it("ProductsTable handlePrint must accept snapshot param and store it in printTrigger", () => {
    const src = fs.readFileSync(productsTablePath, "utf8");
    // Must have 3rd param snapshot handling
    expect(src).toContain("snapshot");
    // Must store snapshot in state that is passed to PrintableTable
    // We look for printTrigger shape containing snapshot and passing printSnapshot prop
    expect(src).toMatch(/handlePrint\s*=\s*\([^)]*snapshot[^)]*\)/);
    expect(src).toMatch(/setPrintTrigger[\s\S]*?snapshot/);
  });

  it("ProductsTable must forward snapshot to PrintableTable via printSnapshot/externalState prop", () => {
    const src = fs.readFileSync(productsTablePath, "utf8");
    expect(src).toMatch(/printSnapshot|externalState.*snapshot|snapshot.*PrintableTable/i);
    // ensure PrintableTable is called with snapshot prop
    expect(src).toMatch(/<PrintableTable[\s\S]*?snapshot/i);
  });

  it("PrintableTable must accept printSnapshot prop and use it as effectiveState for printing", () => {
    const src = fs.readFileSync(printableTablePath, "utf8");
    expect(src).toContain("printSnapshot");
    // effectiveState prioritizes printSnapshot over BillState
    expect(src).toMatch(/printSnapshot\s*\?\?|effectiveState[\s\S]*?printSnapshot/i);
  });

  it("PrintableTable handlePrint must derive billTypeDisplay from snapshot billType (Presupuesto) not reset state", () => {
    const src = fs.readFileSync(printableTablePath, "utf8");
    // billTypeDisplay must be computed from effectiveState/snapshot billType
    expect(src).toMatch(/getBillTypeDisplay\([\s\S]*?effectiveState|getBillTypeDisplay\([\s\S]*?printSnapshot|billTypeDisplay[\s\S]*?snapshot/i);
  });
});

// ---------------------------------------------------------------------------
// AC2 behavioral: snapshot not lost after resetCheckout
// ---------------------------------------------------------------------------
describe("AC2 behavioral — snapshot survives reset", () => {
  it("createBillCheckoutSnapshot Presupuesto survives BillState reset (simulates BillButtons onSuccess -> handlePrint -> resetCheckout)", () => {
    const liveState: BillState = {
      id: "live-1",
      products: [{ id: "p1", description: "Prod A", salePrice: 100, amount: 1 } as never],
      total: 100,
      totalWithDiscount: 100,
      seller: "vendedor@test.com",
      discount: 0,
      date: new Date("2026-03-15T10:00:00Z"),
      typeDocument: "DNI",
      documentNumber: 0,
      IVACondition: "Consumidor Final",
      twoMethods: false,
      billType: "Factura B",
      paidMethod: "Efectivo",
    };

    const snapshot = createBillCheckoutSnapshot(liveState, "Presupuesto");

    // Simulate ProductsTable handlePrint capturing snapshot before reset
    let capturedSnapshot: BillState | undefined;
    const fakeHandlePrint = (cae: unknown, win: unknown, snap?: BillState) => {
      capturedSnapshot = snap;
    };
    fakeHandlePrint(undefined, null, snapshot);

    // Simulate resetCheckout clearing liveState (like BillReducer removeAll)
    liveState.products = [];
    liveState.total = 0;
    liveState.totalWithDiscount = 0;
    (liveState as unknown as { billType: string }).billType = "Factura B";

    expect(capturedSnapshot).toBeDefined();
    expect(capturedSnapshot!.billType).toBe("Presupuesto");
    expect(capturedSnapshot!.products).toHaveLength(1);
    // liveState cleared but snapshot still holds Presupuesto
    expect(liveState.products).toHaveLength(0);
    expect(capturedSnapshot!.billType).not.toBe(liveState.billType);
  });
});

// ---------------------------------------------------------------------------
// Integration: PrintableTable renders Presupuesto when given printSnapshot,
// even if BillContext is reset/default.
// This will FAIL before fix because PrintableTable ignores printSnapshot
// and getBillTypeDisplay returns Remito for Presupuesto without CAE.
// ---------------------------------------------------------------------------
describe("PrintableTable integration — prints Presupuesto from snapshot despite reset context", () => {

  it("AC1/AC2: PrintableTable with printSnapshot Presupuesto shows Presupuesto, hides Medio de Pago and Gracias, shows legend", async () => {
    const { default: PrintableTable } = await import("@/components/Billing/PrintableTable");
    const { BillContext } = await import("@/context/BillContext");

    const presupuestoSnapshot: BillState = {
      id: "snap-1",
      products: [{ id: "p1", description: "Prod Presupuesto", code: "P001", salePrice: 100, amount: 2, price: 100, unit: "unidades" } as never],
      total: 200,
      totalWithDiscount: 200,
      seller: "vendedor@test.com",
      discount: 0,
      date: new Date("2026-03-15T10:00:00Z"),
      typeDocument: "DNI",
      documentNumber: 0,
      IVACondition: "Consumidor Final",
      twoMethods: false,
      billType: "Presupuesto",
      paidMethod: "Efectivo",
      client: "Cliente Test",
    };

    const resetContextValue = {
      BillState: {
        id: "",
        products: [],
        total: 0,
        totalWithDiscount: 0,
        seller: "",
        discount: 0,
        date: new Date(),
        typeDocument: "DNI",
        documentNumber: 0,
        IVACondition: "Consumidor Final",
        twoMethods: false,
        billType: "Factura B",
      } as BillState,
      dispatch: vi.fn(),
      addItem: vi.fn(),
      removeItem: vi.fn(),
      onOrderResetRef: { current: null },
      printMode: "pdf" as const,
      setPrintMode: vi.fn(),
    };

    const { container } = render(
      // @ts-ignore partial mock provider value
      <BillContext.Provider value={resetContextValue as unknown as never}>
        <PrintableTable
          printTrigger={1}
          className=""
          handleClose={() => {}}
          session={{ user: { email: "vendedor@test.com", businessName: "Mi Comercio" } } as never}
          // @ts-ignore printSnapshot is new prop that current code lacks -> will be ignored (test fails)
          printSnapshot={presupuestoSnapshot as unknown as never}
          forceCae={undefined}
        />
      </BillContext.Provider>,
    );

    // Wait for effects (billingInfo fetch, etc.)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const text = container.textContent || "";
    // Before fix: BillContext is reset so billTypeDisplay is Factura B / Remito, not Presupuesto
    // After fix: printSnapshot billType is used
    expect(text).toContain("Presupuesto");
    expect(text).not.toContain("Remito");
    // Must not show Medio de Pago for presupuesto
    // Note: PrintableTable header currently always shows Medio de Pago; after fix it should hide for presupuesto
    // This assertion will FAIL before fix
    await waitFor(() => {
      const t = container.textContent || "";
      expect(t).not.toContain("Medio de Pago");
    });
  });

  it("AC10: historical presupuesto via externalState still renders Presupuesto (regression guard)", async () => {
    const { default: PrintableTable } = await import("@/components/Billing/PrintableTable");
    const { BillContext } = await import("@/context/BillContext");

    const historicalPresupuesto: BillState = {
      id: "hist-1",
      products: [{ id: "p1", description: "Prod Hist", code: "P002", salePrice: 50, amount: 1, price: 50, unit: "unidades" } as never],
      total: 50,
      totalWithDiscount: 50,
      seller: "seller",
      discount: 0,
      date: new Date("2026-03-10T10:00:00Z"),
      typeDocument: "DNI",
      documentNumber: 0,
      IVACondition: "Consumidor Final",
      twoMethods: false,
      billType: "Presupuesto",
      paidMethod: "Efectivo",
    };

    const ctx = {
      BillState: historicalPresupuesto,
      dispatch: vi.fn(),
      addItem: vi.fn(),
      removeItem: vi.fn(),
      onOrderResetRef: { current: null },
      printMode: "pdf" as const,
      setPrintMode: vi.fn(),
    };

    const { container } = render(
      // @ts-ignore partial
      <BillContext.Provider value={ctx as unknown as never}>
        <PrintableTable
          printTrigger={0}
          className=""
          handleClose={() => {}}
          session={{ user: { email: "seller", businessName: "Mi Comercio" } } as never}
          externalState={historicalPresupuesto}
        />
      </BillContext.Provider>,
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });

    const text = container.textContent || "";
    expect(text).toContain("Presupuesto");
  });
});

// ---------------------------------------------------------------------------
// BillButtons onSuccess snapshot contract (AC1/AC2)
// ---------------------------------------------------------------------------
describe("BillButtons budget onSuccess — creates Presupuesto snapshot", () => {
  it("BillButtons snapshot for budget must be billType Presupuesto", () => {
    const billState: BillState = {
      id: "b1",
      products: [{ id: "p1", description: "Prod", salePrice: 100, amount: 1 } as never],
      total: 100,
      totalWithDiscount: 100,
      seller: "seller",
      discount: 0,
      date: new Date(),
      typeDocument: "DNI",
      documentNumber: 0,
      IVACondition: "Consumidor Final",
      twoMethods: false,
      billType: "Factura B",
    };
    const snapshot = createBillCheckoutSnapshot(billState, "Presupuesto");
    expect(snapshot.billType).toBe("Presupuesto");
    expect(snapshot.products).toHaveLength(1);
  });

  it("BillButtons file must call createBillCheckoutSnapshot with Presupuesto and handlePrint with snapshot before reset", () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), "src/components/Billing/BillButtons.tsx"), "utf8");
    expect(src).toContain('createBillCheckoutSnapshot(BillState, "Presupuesto")');
    expect(src).toMatch(/handlePrint\(undefined,\s*targetWin,\s*snapshot\)/);
    // resetCheckout must happen after handlePrint capturing snapshot
    const idxHandlePrint = src.indexOf("handlePrint(undefined, targetWin, snapshot)");
    const idxReset = src.indexOf("resetCheckout()", idxHandlePrint);
    expect(idxHandlePrint).toBeGreaterThan(-1);
    expect(idxReset).toBeGreaterThan(idxHandlePrint);
  });
});
