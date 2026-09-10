// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock auth and DB for server component tests — we will test the file's static properties
vi.mock("@/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { businessId: "business-123", id: "user-1" } }),
}));
vi.mock("@/actions/cashbox", () => ({
  getActiveSession: vi.fn().mockResolvedValue({ success: true, data: { id: "sess1" } }),
}));
vi.mock("@/actions/business-print-settings", () => ({
  getBusinessPrintSettingsAction: vi.fn().mockResolvedValue({ qzTray: false }),
}));
vi.mock("@/lib/db", () => ({
  db: { business: { findUnique: vi.fn().mockResolvedValue({ ptoVenta: [1], condicionIva: "MONOTRIBUTO" }) } },
}));

describe("newBill/page.tsx — AC1, AC4, AC5", () => {
  beforeEach(() => vi.clearAllMocks());

  it("AC5: should remain a Server Component (async function, no 'use client' directive)", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const filePath = path.resolve(process.cwd(), "src/app/(protected)/newBill/page.tsx");
    const content: string = await fs.readFile(filePath, "utf-8");
    expect(content).not.toMatch(/"use client"/);
    expect(content).toMatch(/const NewBillPage = async/);
    expect(content).toMatch(/Promise\.all\(\[[\s\S]*?auth\(\)[\s\S]*?getActiveSession/);
  });

  it("AC1: should import and render ReturnManagerButton inside BillProvider header next to SessionManager and PrintModeSelector", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const filePath = path.resolve(process.cwd(), "src/app/(protected)/newBill/page.tsx");
    const content: string = await fs.readFile(filePath, "utf-8");
    expect(content).toMatch(/ReturnManagerButton/);
    expect(content).toMatch(/SessionManager/);
    expect(content).toMatch(/PrintModeSelector/);
    // Verify ordering: SessionManager, ReturnManagerButton, PrintModeSelector within same flex gap-3
    const headerSection = content.match(/flex items-center gap-3[\s\S]*?SessionManager[\s\S]*?ReturnManagerButton[\s\S]*?PrintModeSelector/);
    expect(headerSection).not.toBeNull();
    // Inside BillProvider
    expect(content).toMatch(/<BillProvider[\s\S]*<div className="bg-white[\s\S]*ReturnManagerButton/);
  });

  it("AC4: BillProvider children should still include ProductsTable and not interfere with BillState", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const filePath = path.resolve(process.cwd(), "src/app/(protected)/newBill/page.tsx");
    const content: string = await fs.readFile(filePath, "utf-8");
    expect(content).toMatch(/ProductsTable/);
    expect(content).not.toMatch(/removeAll|dispatch.*removeAll/);
  });
});

describe("sales/[id]/page.tsx — AC23 detalle con devoluciones asociadas", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should fetch returns and render 'Devoluciones asociadas' section with net calculation", async () => {
    vi.mock("@/actions/sales/history", () => ({
      getSaleByIdAction: vi.fn().mockResolvedValue({
        id: "ckorder12345678901234567890",
        total: 500,
        totalWithDiscount: 500,
        products: [{ id: "p1", description: "Prod", amount: 5, salePrice: 100 }],
        seller: "s@test.com",
        date: new Date(),
      }),
    }));
    vi.mock("@/actions/sales/returns", () => ({
      getSaleReturnsForOrderAction: vi.fn().mockResolvedValue({
        success: true,
        data: [
          { id: "r1", date: new Date("2026-09-03"), total: 180, reason: "Falla", items: [{ quantity: 2, refundAmount: 180, productId: "p1" }] },
          { id: "r2", date: new Date("2026-09-04"), total: 70, reason: "Cambio", items: [{ quantity: 1, refundAmount: 70 }] },
        ],
      }),
    }));

    // Dynamic import after mocks — this component does not exist yet in some branches, so we test file existence pattern
    const fs = await import("fs/promises");
    const path = await import("path");
    const filePath = path.resolve(process.cwd(), "src/app/(protected)/sales/[id]/page.tsx");
    try {
      const content: string = await fs.readFile(filePath, "utf-8");
      expect(content).toMatch(/getSaleReturnsForOrderAction/);
      expect(content).toMatch(/Devoluciones asociadas/);
      expect(content).toMatch(/totalReturned|Neto de la venta/);
    } catch {
      // If file not yet modified, test fails intentionally (TDD)
      expect(false).toBe(true);
    }
  });

  it("should show badge 'Devolución total' when sum(returnQty) === sum(orderQty)", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const filePath = path.resolve(process.cwd(), "src/app/(protected)/sales/[id]/page.tsx");
    try {
      const content: string = await fs.readFile(filePath, "utf-8");
      expect(content).toMatch(/Devoluci[oó]n total/i);
    } catch {
      expect(false).toBe(true);
    }
  });
});

describe("searchBill/page.tsx + SalesTable — AC21, AC22, AC24, AC31", () => {
  it("should use getSalesWithReturnsAction or enriched getSalesAction and render SaleHistoryEntryRow", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const searchBillPath = path.resolve(process.cwd(), "src/app/(protected)/searchBill/page.tsx");
    const salesTablePath = path.resolve(process.cwd(), "src/components/Billing/SalesTable.tsx");
    try {
      const searchContent: string = await fs.readFile(searchBillPath, "utf-8");
      const tableContent: string = await fs.readFile(salesTablePath, "utf-8");
      const usesHistoryEntry =
        searchContent.includes("getSalesWithReturnsAction") ||
        searchContent.includes("SaleHistoryEntry") ||
        tableContent.includes("getSalesWithReturnsAction") ||
        tableContent.includes("SaleHistoryEntryRow");
      expect(usesHistoryEntry).toBe(true);
      // Check that gross/returns/net are displayed
      const hasNetTotals = tableContent.includes("netTotal") || tableContent.includes("Ventas brutas") || tableContent.includes("Neto");
      expect(hasNetTotals).toBe(true);
    } catch {
      expect(false).toBe(true);
    }
  });

  it("SalesTable should keep cursor pagination and not lose returns (AC24)", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const salesTablePath = path.resolve(process.cwd(), "src/components/Billing/SalesTable.tsx");
    const content: string = await fs.readFile(salesTablePath, "utf-8");
    // Must handle cursor and merges entries — check for cursor usage
    expect(content).toMatch(/cursor/);
    expect(content).toMatch(/getSalesAction|getSalesWithReturnsAction/);
  });
});

describe("CashMovement and StockMovement audit — AC15, AC16", () => {
  it("StockMovement type RETURN should have quantity positive and reason containing Devolución #", async () => {
    // This is verified in processReturnAction transaction test, but we also assert file contract
    const fs = await import("fs/promises");
    const path = await import("path");
    const targetPath = path.resolve(process.cwd(), "src/actions/sales/returns.ts");
    const content: string = await fs.readFile(targetPath, "utf-8");
    expect(content).toMatch(/type: "RETURN"/);
    expect(content).toMatch(/quantity: item\.quantity/);
    expect(content).toMatch(/Devoluci[oó]n #/);
    expect(content).toMatch(/paidMethod: "Devoluci[oó]n"/);
    expect(content).toMatch(/total: -totalRefund/);
  });
});

describe("Variant D — OrderType RETURN conditional — AC26", () => {
  it("if prisma schema has OrderType enum or isReturn field, processReturnAction creates Order with negative total in same transaction", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const schemaPath = path.resolve(process.cwd(), "prisma/schema.prisma");
    const processFilePath = path.resolve(process.cwd(), "src/actions/sales/process.ts");
    const schema: string = await fs.readFile(schemaPath, "utf-8");
    const processContent: string = await fs.readFile(processFilePath, "utf-8");
    const hasVariantD = schema.includes("enum OrderType") || schema.includes("isReturn");
    if (hasVariantD) {
      expect(processContent).toMatch(/type.*RETURN|isReturn.*true/);
      expect(processContent).toMatch(/total: -/);
      expect(processContent).toMatch(/parentOrderId/);
      // getDailyReportAction should not double subtract
      const historyPath = path.resolve(process.cwd(), "src/actions/sales/history.ts");
      const history: string = await fs.readFile(historyPath, "utf-8");
      expect(history).not.toMatch(/totalReturns.*sum.*SaleReturn.*netTotal = totalSales - totalReturns/);
      expect(history).toMatch(/sum\(Order\.total\)/);
    } else {
      // Pattern C is adopted — SaleReturn is source of truth, no Order negative row
      expect(schema).not.toMatch(/enum OrderType/);
      expect(true).toBe(true);
    }
  });
});

describe("Non-regression — AC27, AC28, AC29, AC31", () => {
  it("AC27: processSaleAction still works after modal changes (no regression)", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const processPath = path.resolve(process.cwd(), "src/actions/sales/process.ts");
    const content: string = await fs.readFile(processPath, "utf-8");
    expect(content).toMatch(/export const processSaleAction/);
    expect(content).toMatch(/db\.\$transaction/);
  });

  it("AC31: search and history actions should use findMany with take/cursor/select minimal and parallel queries (no N+1)", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const historyPath = path.resolve(process.cwd(), "src/actions/sales/history.ts");
    const content: string = await fs.readFile(historyPath, "utf-8");
    // Check for Promise.all parallel and select/take usage
    expect(content).toMatch(/Promise\.all/);
    // Search action should exist in returns.ts
    const returnsPath = path.resolve(process.cwd(), "src/actions/sales/returns.ts");
    try {
      const returnsContent: string = await fs.readFile(returnsPath, "utf-8");
      expect(returnsContent).toMatch(/take/);
      expect(returnsContent).toMatch(/cursor|skip/);
      expect(returnsContent).not.toMatch(/for.*await.*findUnique/); // no N+1
    } catch {
      // File not yet exists — TDD red
      expect(false).toBe(true);
    }
  });
});
