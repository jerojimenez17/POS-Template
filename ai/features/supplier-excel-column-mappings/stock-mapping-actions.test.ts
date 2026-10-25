// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as stockActions from "@/actions/stock";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  supplierFindFirst: vi.fn(),
  supplierUpdate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    supplier: {
      findFirst: mocks.supplierFindFirst,
      update: mocks.supplierUpdate,
    },
  },
}));

vi.mock("../../../auth", () => ({ auth: mocks.auth }));

interface SupplierExcelColumnMapping {
  code: string;
  description: string;
  price: string;
  amount: string | null;
  brand: string | null;
  category: string | null;
  subCategory: string | null;
  codebar: string | null;
  iva: string | null;
}

type MappingActionResult = {
  mapping?: SupplierExcelColumnMapping | null;
  success?: boolean;
  error?: string;
};

const VALID_MAPPING: SupplierExcelColumnMapping = {
  code: "A",
  description: "B",
  price: "C",
  amount: "D",
  brand: null,
  category: "F",
  subCategory: null,
  codebar: "H",
  iva: "I",
};

const BUSINESS_ID = "business-active";
const SUPPLIER_ID = "supplier-owned";

function action(name: "getSupplierExcelColumnMapping" | "saveSupplierExcelColumnMapping") {
  const candidate = (stockActions as unknown as Record<string, unknown>)[name];
  expect(candidate, `stock action ${name} must be exported from src/actions/stock.ts`).toBeTypeOf("function");
  return candidate as (...args: unknown[]) => Promise<MappingActionResult>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { businessId: BUSINESS_ID } });
  mocks.supplierFindFirst.mockResolvedValue({ excelColumnMapping: VALID_MAPPING });
  mocks.supplierUpdate.mockResolvedValue({ id: SUPPLIER_ID });
});

describe("supplier Excel mapping server actions", () => {
  it("reads only the selected supplier's mapping within the authenticated active business", async () => {
    const result = await action("getSupplierExcelColumnMapping")(SUPPLIER_ID);

    expect(mocks.auth).toHaveBeenCalledOnce();
    expect(mocks.supplierFindFirst).toHaveBeenCalledWith({
      where: { id: SUPPLIER_ID, businessId: BUSINESS_ID },
      select: { excelColumnMapping: true },
    });
    expect(result).toEqual({ mapping: VALID_MAPPING });
  });

  it("returns null when an authorized supplier has no saved mapping", async () => {
    mocks.supplierFindFirst.mockResolvedValue({ excelColumnMapping: null });

    const result = await action("getSupplierExcelColumnMapping")(SUPPLIER_ID);

    expect(result).toEqual({ mapping: null });
  });

  it("does not disclose mappings to an unauthenticated caller", async () => {
    mocks.auth.mockResolvedValue(null);

    const result = await action("getSupplierExcelColumnMapping")(SUPPLIER_ID);

    expect(result.mapping).toBeUndefined();
    expect(result.error).toBeTruthy();
    expect(mocks.supplierFindFirst).not.toHaveBeenCalled();
  });

  it("does not disclose mappings for nonexistent or foreign-business suppliers", async () => {
    mocks.supplierFindFirst.mockResolvedValue(null);

    const result = await action("getSupplierExcelColumnMapping")("foreign-supplier");

    expect(mocks.supplierFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "foreign-supplier", businessId: BUSINESS_ID },
    }));
    expect(result.mapping).toBeUndefined();
    expect(result.error).toBeTruthy();
  });

  it("validates persisted JSON before returning a mapping to the client", async () => {
    mocks.supplierFindFirst.mockResolvedValue({
      excelColumnMapping: { ...VALID_MAPPING, iva: "column-9" },
    });

    const result = await action("getSupplierExcelColumnMapping")(SUPPLIER_ID);

    expect(result.mapping).toBeUndefined();
    expect(result.error).toBeTruthy();
  });

  it("returns a user-facing error when the scoped mapping read fails", async () => {
    mocks.supplierFindFirst.mockRejectedValue(new Error("database unavailable"));

    const result = await action("getSupplierExcelColumnMapping")(SUPPLIER_ID);

    expect(result.mapping).toBeUndefined();
    expect(result.error).toBeTruthy();
  });

  it("normalizes letters and empty optional fields, then writes only the mapping on an owned supplier", async () => {
    const input = {
      ...VALID_MAPPING,
      code: " aa ",
      description: "b",
      price: " c ",
      brand: " ",
    };

    const result = await action("saveSupplierExcelColumnMapping")(SUPPLIER_ID, input);

    expect(result.success).toBe(true);
    expect(mocks.supplierFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: SUPPLIER_ID, businessId: BUSINESS_ID },
    }));
    expect(mocks.supplierUpdate).toHaveBeenCalledWith({
      where: { id: SUPPLIER_ID, businessId: BUSINESS_ID },
      data: {
        excelColumnMapping: {
          ...VALID_MAPPING,
          code: "AA",
          description: "B",
          price: "C",
          brand: null,
        },
      },
    });
  });

  it.each([
    ["missing required code", { ...VALID_MAPPING, code: "" }],
    ["malformed column letters", { ...VALID_MAPPING, price: "A1" }],
    ["non-letter punctuation", { ...VALID_MAPPING, description: "AA!" }],
    ["malformed optional columns", { ...VALID_MAPPING, iva: "2" }],
    ["undefined optional columns", { ...VALID_MAPPING, brand: undefined }],
    ["unknown mapping keys", { ...VALID_MAPPING, surprise: "J" }],
  ])("rejects %s without writing supplier data", async (_case, invalidMapping) => {
    const result = await action("saveSupplierExcelColumnMapping")(
      SUPPLIER_ID,
      invalidMapping,
    );

    expect(result.success).not.toBe(true);
    expect(result.error).toBeTruthy();
    expect(mocks.supplierUpdate).not.toHaveBeenCalled();
  });

  it("never writes a mapping to a nonexistent or foreign-business supplier", async () => {
    mocks.supplierFindFirst.mockResolvedValue(null);

    const result = await action("saveSupplierExcelColumnMapping")("foreign-supplier", VALID_MAPPING);

    expect(result.success).not.toBe(true);
    expect(result.error).toBeTruthy();
    expect(mocks.supplierUpdate).not.toHaveBeenCalled();
  });

  it("does not write anything when the caller is unauthenticated", async () => {
    mocks.auth.mockResolvedValue(null);

    const result = await action("saveSupplierExcelColumnMapping")(SUPPLIER_ID, VALID_MAPPING);

    expect(result.success).not.toBe(true);
    expect(result.error).toBeTruthy();
    expect(mocks.supplierFindFirst).not.toHaveBeenCalled();
    expect(mocks.supplierUpdate).not.toHaveBeenCalled();
  });

  it("returns a user-facing error when persistence fails after ownership verification", async () => {
    mocks.supplierUpdate.mockRejectedValue(new Error("database unavailable"));

    const result = await action("saveSupplierExcelColumnMapping")(SUPPLIER_ID, VALID_MAPPING);

    expect(result.success).not.toBe(true);
    expect(result.error).toBeTruthy();
    expect(mocks.supplierFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: SUPPLIER_ID, businessId: BUSINESS_ID },
    }));
  });

  it("preserves supplier discount, IVA and gain by updating only excelColumnMapping", async () => {
    await action("saveSupplierExcelColumnMapping")(SUPPLIER_ID, VALID_MAPPING);

    const updateInput = mocks.supplierUpdate.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(Object.keys(updateInput.data)).toEqual(["excelColumnMapping"]);
    expect(updateInput.data).not.toHaveProperty("discount");
    expect(updateInput.data).not.toHaveProperty("iva");
    expect(updateInput.data).not.toHaveProperty("gain");
  });
});
