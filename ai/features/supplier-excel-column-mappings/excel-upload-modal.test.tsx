import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelUploadModal from "@/components/stock/excel-upload-modal";

const mocks = vi.hoisted(() => ({
  getSuppliers: vi.fn(),
  getSupplierExcelColumnMapping: vi.fn(),
  saveSupplierExcelColumnMapping: vi.fn(),
  previewProductsBulk: vi.fn(),
  processBulkProductBatch: vi.fn(),
  finalizeBulkImport: vi.fn(),
  read: vi.fn(),
  sheetToJson: vi.fn(),
  toastError: vi.fn(),
  toastLoading: vi.fn(),
  toastDismiss: vi.fn(),
}));

vi.mock("@/actions/stock", () => ({
  getSuppliers: mocks.getSuppliers,
  getSupplierExcelColumnMapping: mocks.getSupplierExcelColumnMapping,
  saveSupplierExcelColumnMapping: mocks.saveSupplierExcelColumnMapping,
  previewProductsBulk: mocks.previewProductsBulk,
  processBulkProductBatch: mocks.processBulkProductBatch,
  finalizeBulkImport: mocks.finalizeBulkImport,
}));

vi.mock("xlsx", () => ({
  read: mocks.read,
  utils: { sheet_to_json: mocks.sheetToJson },
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    loading: mocks.toastLoading,
    dismiss: mocks.toastDismiss,
    success: vi.fn(),
  },
}));

vi.mock("@/components/stock/create-attribute-modal", () => ({
  default: ({ onSuccess }: { onSuccess: (supplier: { id: string; name: string }) => void }) => (
    <button type="button" onClick={() => onSuccess({ id: "supplier-new", name: "New Supplier" })}>
      Create supplier fixture
    </button>
  ),
}));

const SAVED_MAPPING = {
  code: "C",
  description: "A",
  price: "B",
  amount: "D",
  brand: null,
  category: "F",
  subCategory: null,
  codebar: "H",
  iva: "I",
};

const SUCCESSFUL_PREVIEW = {
  preview: {
    createdCount: 1,
    updatedCount: 0,
    ignoredCount: 0,
    totalItems: 1,
    items: [{ code: "SKU-1", description: "Item", price: 100, status: "create" }],
  },
};

const SUPPLIERS = [
  { id: "supplier-a", name: "Supplier A", discount: 5, iva: 10.5, gain: 20 },
  { id: "supplier-b", name: "Supplier B", discount: 12, iva: 21, gain: 35 },
];

function renderModal() {
  return render(<ExcelUploadModal open onOpenChange={vi.fn()} onSuccess={vi.fn()} />);
}

function makeWorkbookFile() {
  const file = new File(["workbook fixture"], "supplier.xlsx");
  Object.defineProperty(file, "arrayBuffer", {
    value: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
  });
  return file;
}

async function uploadWorkbook(user: ReturnType<typeof userEvent.setup>) {
  const fileInput = screen.getByLabelText("Archivo Excel (.xlsx, .xls)");
  await user.upload(fileInput, makeWorkbookFile());
}

async function preview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /siguiente/i }));
}

function inputFor(placeholder: string) {
  return screen.getByPlaceholderText(placeholder) as HTMLInputElement;
}

function setRows(rows: unknown[][]) {
  mocks.sheetToJson.mockReturnValue(rows);
  mocks.read.mockReturnValue({
    SheetNames: ["Products"],
    Sheets: { Products: { fixture: true } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSuppliers.mockResolvedValue(SUPPLIERS);
  mocks.getSupplierExcelColumnMapping.mockResolvedValue({ mapping: null });
  mocks.saveSupplierExcelColumnMapping.mockResolvedValue({ success: true });
  mocks.previewProductsBulk.mockResolvedValue(SUCCESSFUL_PREVIEW);
  mocks.processBulkProductBatch.mockResolvedValue({ createdCount: 0, updatedCount: 0 });
  mocks.finalizeBulkImport.mockResolvedValue({ success: true });
  setRows([
    ["Código", "Descripción", "Precio", "Cantidad", "Marca", "Categoría", "Subcategoría", "EAN", "IVA"],
    ["SKU-1", "Item", 100, 3, "Acme", "Food", "Snacks", "12345", "21%"],
  ]);
});

describe("ExcelUploadModal supplier-specific column mappings", () => {
  it("loads all nine saved columns, including optional values, and previews with saved precedence over headers", async () => {
    const user = userEvent.setup();
    mocks.getSupplierExcelColumnMapping.mockResolvedValue({ mapping: SAVED_MAPPING });
    setRows([
      ["Código", "Descripción", "Precio", "Cantidad", "Marca", "Categoría", "Subcategoría", "EAN", "IVA"],
      ["Description in A", 150, "CODE-IN-C", 4, "Brand", "Category", "Subcategory", "BAR", "10.5%"],
    ]);
    renderModal();

    await user.selectOptions(await screen.findByLabelText("Seleccionar proveedor"), "supplier-a");
    await expect.poll(() => inputFor("Ej: A").value).toBe("C");
    expect(inputFor("Ej: B").value).toBe("A");
    expect(inputFor("Ej: C").value).toBe("B");
    expect(inputFor("Ej: D").value).toBe("D");
    expect(inputFor("Ej: E").value).toBe("");
    expect(inputFor("Ej: F").value).toBe("F");
    expect(inputFor("Ej: G").value).toBe("");
    expect(inputFor("Ej: H").value).toBe("H");
    expect(inputFor("Ej: I").value).toBe("I");

    await uploadWorkbook(user);
    await preview(user);

    expect(mocks.previewProductsBulk).toHaveBeenCalledWith(
      [expect.objectContaining({ code: "CODE-IN-C", description: "Description in A", price: 150 })],
      false,
      false,
      5,
      10.5,
      20,
      "supplier-a",
      false,
    );
    expect(mocks.saveSupplierExcelColumnMapping).toHaveBeenCalledWith("supplier-a", SAVED_MAPPING);
  });

  it("prefills required and recognized optional columns from headers before preview and uses an edit as the active mapping", async () => {
    const user = userEvent.setup();
    renderModal();
    await uploadWorkbook(user);

    await expect.poll(() => inputFor("Ej: A").value).toBe("A");
    expect(inputFor("Ej: B").value).toBe("B");
    expect(inputFor("Ej: C").value).toBe("C");
    expect(inputFor("Ej: D").value).toBe("D");
    expect(inputFor("Ej: E").value).toBe("E");
    expect(inputFor("Ej: F").value).toBe("F");
    expect(inputFor("Ej: G").value).toBe("G");
    expect(inputFor("Ej: H").value).toBe("H");
    expect(inputFor("Ej: I").value).toBe("I");

    await user.clear(inputFor("Ej: A"));
    await user.type(inputFor("Ej: A"), "B");
    await preview(user);

    expect(mocks.previewProductsBulk).toHaveBeenCalledWith(
      [expect.objectContaining({ code: "Item", description: "SKU-1", price: 100, amount: 3, iva: "21%" })],
      false,
      false,
      0,
      0,
      0,
      undefined,
      false,
    );
    expect(mocks.saveSupplierExcelColumnMapping).not.toHaveBeenCalled();
  });

  it("keeps A/B/C and optional blanks after incomplete detection and does not persist untouched fallback defaults", async () => {
    const user = userEvent.setup();
    setRows([
      ["Reference", "Long name", "Wholesale", "Available"],
      ["SKU-1", "Item", 100, 3],
    ]);
    renderModal();
    await uploadWorkbook(user);
    await expect.poll(() => inputFor("Ej: A").value).toBe("A");

    expect(inputFor("Ej: B").value).toBe("B");
    expect(inputFor("Ej: C").value).toBe("C");
    expect(inputFor("Ej: D").value).toBe("");
    await user.selectOptions(await screen.findByLabelText("Seleccionar proveedor"), "supplier-a");
    await preview(user);

    expect(mocks.saveSupplierExcelColumnMapping).not.toHaveBeenCalled();
  });

  it("persists a valid manually configured mapping only after a successful non-empty preview", async () => {
    const user = userEvent.setup();
    setRows([
      ["Ref", "Name", "Net", "Inventory"],
      ["SKU-1", "Item", 100, 3],
    ]);
    renderModal();
    await user.selectOptions(await screen.findByLabelText("Seleccionar proveedor"), "supplier-a");
    await uploadWorkbook(user);
    await user.clear(inputFor("Ej: A"));
    await user.type(inputFor("Ej: A"), "A");
    await user.clear(inputFor("Ej: B"));
    await user.type(inputFor("Ej: B"), "B");
    await user.clear(inputFor("Ej: C"));
    await user.type(inputFor("Ej: C"), "C");
    await preview(user);

    expect(mocks.saveSupplierExcelColumnMapping).toHaveBeenCalledWith("supplier-a", expect.objectContaining({
      code: "A", description: "B", price: "C",
    }));
    expect(await screen.findByText("Vista Previa de Importación")).toBeInTheDocument();
  });

  it.each([
    ["preview action error", { error: "Preview failed" }],
    ["empty parsed workbook", null],
  ])("does not persist a mapping after %s", async (_scenario, previewResult) => {
    const user = userEvent.setup();
    mocks.previewProductsBulk.mockResolvedValue(previewResult);
    if (previewResult === null) setRows([["Code", "Description", "Price"]]);
    renderModal();
    await user.selectOptions(await screen.findByLabelText("Seleccionar proveedor"), "supplier-a");
    await uploadWorkbook(user);
    await preview(user);

    expect(mocks.saveSupplierExcelColumnMapping).not.toHaveBeenCalled();
  });

  it("does not persist invalid required column letters, even if the preview action succeeds", async () => {
    const user = userEvent.setup();
    setRows([["Ref", "Name", "Net"], ["SKU-1", "Item", 100]]);
    renderModal();
    await user.selectOptions(await screen.findByLabelText("Seleccionar proveedor"), "supplier-a");
    await uploadWorkbook(user);
    await user.clear(inputFor("Ej: A"));
    await user.type(inputFor("Ej: A"), "A1");
    await preview(user);

    expect(mocks.saveSupplierExcelColumnMapping).not.toHaveBeenCalled();
  });

  it("keeps a successful preview usable and reports a non-blocking mapping-save failure", async () => {
    const user = userEvent.setup();
    mocks.saveSupplierExcelColumnMapping.mockResolvedValue({ error: "Could not save mapping" });
    renderModal();
    await user.selectOptions(await screen.findByLabelText("Seleccionar proveedor"), "supplier-a");
    await uploadWorkbook(user);
    await preview(user);

    expect(await screen.findByText("Vista Previa de Importación")).toBeInTheDocument();
    expect(mocks.toastError).toHaveBeenCalled();
  });

  it("clears supplier mapping on deselection and never saves it without a selected supplier", async () => {
    const user = userEvent.setup();
    mocks.getSupplierExcelColumnMapping.mockResolvedValue({ mapping: SAVED_MAPPING });
    renderModal();
    const supplierSelect = await screen.findByLabelText("Seleccionar proveedor");
    await user.selectOptions(supplierSelect, "supplier-a");
    await expect.poll(() => inputFor("Ej: A").value).toBe("C");
    await user.selectOptions(supplierSelect, "");
    await expect.poll(() => inputFor("Ej: A").value).toBe("A");

    await uploadWorkbook(user);
    await preview(user);
    expect(mocks.saveSupplierExcelColumnMapping).not.toHaveBeenCalled();
  });

  it("does not apply or save an older supplier mapping response after a newer supplier is selected", async () => {
    const user = userEvent.setup();
    let resolveSupplierA: (result: { mapping: typeof SAVED_MAPPING }) => void = () => undefined;
    mocks.getSupplierExcelColumnMapping.mockImplementation((supplierId: string) => {
      if (supplierId === "supplier-a") {
        return new Promise((resolve) => {
          resolveSupplierA = resolve as typeof resolveSupplierA;
        });
      }
      return Promise.resolve({ mapping: { ...SAVED_MAPPING, code: "D", description: "E", price: "F" } });
    });
    renderModal();
    const supplierSelect = await screen.findByLabelText("Seleccionar proveedor");
    await user.selectOptions(supplierSelect, "supplier-a");
    await user.selectOptions(supplierSelect, "supplier-b");
    await expect.poll(() => inputFor("Ej: A").value).toBe("D");
    resolveSupplierA({ mapping: SAVED_MAPPING });

    await expect.poll(() => inputFor("Ej: A").value).toBe("D");
    expect(mocks.getSupplierExcelColumnMapping).toHaveBeenNthCalledWith(1, "supplier-a");
    expect(mocks.getSupplierExcelColumnMapping).toHaveBeenNthCalledWith(2, "supplier-b");

    setRows([["Reference", "Name", "Net", "Stock", "Brand", "Category"], ["x", "y", 40, "SKU-B", "Item B", 60]]);
    await uploadWorkbook(user);
    await preview(user);
    expect(mocks.previewProductsBulk).toHaveBeenCalledWith(
      [expect.objectContaining({ code: "SKU-B", description: "Item B", price: 60 })],
      false,
      false,
      12,
      21,
      35,
      "supplier-b",
      false,
    );
    expect(mocks.saveSupplierExcelColumnMapping).toHaveBeenCalledWith(
      "supplier-b",
      expect.objectContaining({ code: "D", description: "E", price: "F" }),
    );
  });

  it("waits for the selected supplier mapping before preview and then uses only that saved mapping", async () => {
    const user = userEvent.setup();
    let resolveSupplierMapping: (result: { mapping: typeof SAVED_MAPPING }) => void = () => undefined;
    mocks.getSupplierExcelColumnMapping.mockImplementation(() => new Promise((resolve) => {
      resolveSupplierMapping = resolve as typeof resolveSupplierMapping;
    }));
    setRows([
      ["Código", "Descripción", "Precio", "Cantidad", "Marca", "Categoría", "Subcategoría", "EAN", "IVA"],
      ["SKU-1", "Item", 100, 3, "Acme", "Food", "Snacks", "12345", "21%"],
    ]);
    renderModal();
    await user.selectOptions(await screen.findByLabelText("Seleccionar proveedor"), "supplier-a");
    await uploadWorkbook(user);
    await expect.poll(() => mocks.sheetToJson.mock.calls.length).toBe(1);
    const sheetParseCountBeforePreview = mocks.sheetToJson.mock.calls.length;

    // Give the preview's file parsing a turn to complete while the supplier lookup is unresolved.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await preview(user);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect.soft(mocks.previewProductsBulk).not.toHaveBeenCalled();
    expect.soft(mocks.saveSupplierExcelColumnMapping).not.toHaveBeenCalled();
    expect.soft(mocks.sheetToJson).toHaveBeenCalledTimes(sheetParseCountBeforePreview);

    resolveSupplierMapping({ mapping: SAVED_MAPPING });
    if (screen.queryByRole("button", { name: /volver/i })) {
      await user.click(screen.getByRole("button", { name: /volver/i }));
    }
    await expect.poll(() => inputFor("Ej: A").value).toBe("C");
    await preview(user);

    expect(mocks.previewProductsBulk).toHaveBeenCalledTimes(1);
    expect(mocks.previewProductsBulk).toHaveBeenCalledWith(
      [expect.objectContaining({ code: "100", description: "SKU-1" })],
      false,
      false,
      5,
      10.5,
      20,
      "supplier-a",
      false,
    );
    expect(mocks.saveSupplierExcelColumnMapping).toHaveBeenCalledTimes(1);
    expect(mocks.saveSupplierExcelColumnMapping).toHaveBeenCalledWith("supplier-a", SAVED_MAPPING);
  });

  it("rejects a malformed optional column before parsing or preview and shows validation to the user", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.selectOptions(await screen.findByLabelText("Seleccionar proveedor"), "supplier-a");
    await uploadWorkbook(user);
    await expect.poll(() => inputFor("Ej: E").value).toBe("E");
    await expect.poll(() => mocks.sheetToJson.mock.calls.length).toBe(1);
    const sheetParseCountBeforePreview = mocks.sheetToJson.mock.calls.length;
    await user.clear(inputFor("Ej: E"));
    await user.type(inputFor("Ej: E"), "A1");
    await preview(user);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect.soft(mocks.sheetToJson).toHaveBeenCalledTimes(sheetParseCountBeforePreview);
    expect.soft(mocks.previewProductsBulk).not.toHaveBeenCalled();
    expect.soft(mocks.saveSupplierExcelColumnMapping).not.toHaveBeenCalled();
    expect.soft(screen.queryByText(/marca.*(columna|letra)|columna.*marca|columna.*válida/i)).not.toBeNull();
  });

  it("retains existing discount, IVA and gain prefills when a supplier is chosen", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.selectOptions(await screen.findByLabelText("Seleccionar proveedor"), "supplier-b");

    expect((screen.getByLabelText("Descuento %") as HTMLInputElement).value).toBe("12");
    expect((screen.getByLabelText("IVA %") as HTMLSelectElement).value).toBe("21");
    expect((screen.getByLabelText("Ganancia %") as HTMLInputElement).value).toBe("35");
  });

  it("loads a newly created supplier's mapping rather than retaining the prior supplier mapping", async () => {
    const user = userEvent.setup();
    mocks.getSupplierExcelColumnMapping.mockImplementation((supplierId: string) =>
      Promise.resolve({
        mapping: supplierId === "supplier-new" ? { ...SAVED_MAPPING, code: "J" } : SAVED_MAPPING,
      }),
    );
    renderModal();
    await user.selectOptions(await screen.findByLabelText("Seleccionar proveedor"), "supplier-a");
    await user.click(screen.getByRole("button", { name: "Create supplier fixture" }));

    await expect.poll(() => inputFor("Ej: A").value).toBe("J");
    expect(mocks.getSupplierExcelColumnMapping).toHaveBeenCalledWith("supplier-new");
  });

  it("resets detected mapping provenance when the selected file changes", async () => {
    const user = userEvent.setup();
    renderModal();
    const fileInput = screen.getByLabelText("Archivo Excel (.xlsx, .xls)");
    await user.upload(fileInput, makeWorkbookFile());
    await expect.poll(() => inputFor("Ej: D").value).toBe("D");

    setRows([["Reference", "Long name", "Wholesale"], ["SKU-2", "Second item", 80]]);
    const replacement = new File(["second workbook"], "second.xlsx");
    Object.defineProperty(replacement, "arrayBuffer", {
      value: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    });
    await user.upload(fileInput, replacement);

    await expect.poll(() => inputFor("Ej: D").value).toBe("");
    expect(inputFor("Ej: A").value).toBe("A");
  });

  it("preserves configured start and end row fallback for workbooks without recognizable headers", async () => {
    const user = userEvent.setup();
    setRows([
      ["Reference", "Long name", "Wholesale"],
      ["ignored", "not data", "not numeric"],
      ["SKU-3", "Third item", 80],
      ["SKU-4", "Out of range", 90],
    ]);
    renderModal();
    await uploadWorkbook(user);
    await user.clear(screen.getByPlaceholderText("2"));
    await user.type(screen.getByPlaceholderText("2"), "3");
    await user.clear(screen.getByPlaceholderText("Última fila"));
    await user.type(screen.getByPlaceholderText("Última fila"), "3");
    await preview(user);

    expect(mocks.previewProductsBulk).toHaveBeenCalledWith(
      [expect.objectContaining({ code: "SKU-3", description: "Third item", price: 80 })],
      false,
      false,
      0,
      0,
      0,
      undefined,
      false,
    );
    expect(mocks.saveSupplierExcelColumnMapping).not.toHaveBeenCalled();
  });
});
