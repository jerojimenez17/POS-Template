// import React from "react";
// import { describe, it, expect, vi, beforeEach } from "vitest";
// import { render, screen, waitFor, fireEvent } from "@testing-library/react";
// import BulkUnitUpdate from "@/components/stock/bulk-unit-update";
// /* eslint-disable @typescript-eslint/no-explicit-any */
// vi.mock("@/actions/stock", () => ({
//   bulkUpdateAmounts: vi.fn().mockResolvedValue({ success: true }),
// }));

// vi.mock("@/components/ui/button", () => ({
//   Button: ({ children, onClick, disabled, "data-testid": testId }: any) => (
//     <button data-testid={testId || "button"} onClick={onClick} disabled={disabled}>
//       {children}
//     </button>
//   ),
// }));

// vi.mock("@/components/ui/input", () => ({
//   Input: ({ placeholder, value, onChange, type, "data-testid": testId }: any) => (
//     <input
//       data-testid={testId || "input"}
//       placeholder={placeholder}
//       value={value}
//       onChange={onChange}
//       type={type}
//     />
//   ),
// }));

// vi.mock("lucide-react", () => ({
//   Package: () => <div data-testid="package-icon" />,
// }));

// describe("BulkUnitUpdate Component", () => {
//   const mockOnSuccess = vi.fn();

//   beforeEach(() => {
//     vi.clearAllMocks();
//   });

//   it("should not render when no products are selected", () => {
//     render(
//       <BulkUnitUpdate
//         selectedProductIds={[]}
//         onSuccess={mockOnSuccess}
//       />
//     );

//     expect(screen.queryByText("Actualizar Unidades")).not.toBeInTheDocument();
//   });

//   it("should render when products are selected", () => {
//     render(
//       <BulkUnitUpdate
//         selectedProductIds={["product-1"]}
//         onSuccess={mockOnSuccess}
//       />
//     );

//     expect(screen.getByText("Actualizar Unidades")).toBeInTheDocument();
//   });

//   it("should render mode selector with three options", () => {
//     render(
//       <BulkUnitUpdate
//         selectedProductIds={["product-1"]}
//         onSuccess={mockOnSuccess}
//       />
//     );

//     expect(screen.getByText("Set Exact")).toBeInTheDocument();
//     expect(screen.getByText("Add")).toBeInTheDocument();
//     expect(screen.getByText("Subtract")).toBeInTheDocument();
//   });

//   it("should render amount input field", () => {
//     render(
//       <BulkUnitUpdate
//         selectedProductIds={["product-1"]}
//         onSuccess={mockOnSuccess}
//       />
//     );

//     const amountInput = screen.getByPlaceholderText("Cantidad");
//     expect(amountInput).toBeInTheDocument();
//     expect(amountInput).toHaveAttribute("type", "number");
//   });

//   it("should render Aplicar button", () => {
//     render(
//       <BulkUnitUpdate
//         selectedProductIds={["product-1"]}
//         onSuccess={mockOnSuccess}
//       />
//     );

//     expect(screen.getByText("Aplicar Unidades")).toBeInTheDocument();
//   });

//   it("should update mode when selector changes", async () => {
//     render(
//       <BulkUnitUpdate
//         selectedProductIds={["product-1"]}
//         onSuccess={mockOnSuccess}
//       />
//     );

//     const modeSelector = screen.getByText("Set Exact");
//     fireEvent.click(modeSelector);

//     const addOption = screen.getByText("Add");
//     fireEvent.click(addOption);

//     expect(screen.getByDisplayValue("add")).toBeInTheDocument();
//   });

//   it("should update amount when input changes", () => {
//     render(
//       <BulkUnitUpdate
//         selectedProductIds={["product-1"]}
//         onSuccess={mockOnSuccess}
//       />
//     );

//     const amountInput = screen.getByPlaceholderText("Cantidad");
//     fireEvent.change(amountInput, { target: { value: "100" } });

//     expect(amountInput).toHaveValue(100);
//   });

//   it("should show confirmation dialog when Aplicar is clicked", async () => {
//     render(
//       <BulkUnitUpdate
//         selectedProductIds={["product-1"]}
//         onSuccess={mockOnSuccess}
//       />
//     );

//     const amountInput = screen.getByPlaceholderText("Cantidad");
//     fireEvent.change(amountInput, { target: { value: "100" } });

//     const applyButton = screen.getByText("Aplicar Unidades");
//     fireEvent.click(applyButton);

//     expect(screen.getByText("Confirmar actualización de unidades")).toBeInTheDocument();
//   });

//   it("should call bulkUpdateAmounts with correct params (mode: set)", async () => {
//     const { bulkUpdateAmounts } = await import("@/actions/stock");

//     render(
//       <BulkUnitUpdate
//         selectedProductIds={["product-1", "product-2"]}
//         onSuccess={mockOnSuccess}
//       />
//     );

//     const amountInput = screen.getByPlaceholderText("Cantidad");
//     fireEvent.change(amountInput, { target: { value: "100" } });

//     const applyButton = screen.getByText("Aplicar Unidades");
//     fireEvent.click(applyButton);

//     const confirmButton = screen.getByText("Confirmar");
//     fireEvent.click(confirmButton);

//     expect(bulkUpdateAmounts).toHaveBeenCalledWith(
//       ["product-1", "product-2"],
//       100,
//       "set"
//     );
//   });

//   it("should call bulkUpdateAmounts with correct params (mode: add)", async () => {
//     const { bulkUpdateAmounts } = await import("@/actions/stock");

//     render(
//       <BulkUnitUpdate
//         selectedProductIds={["product-1"]}
//         onSuccess={mockOnSuccess}
//       />
//     );

//     const modeSelector = screen.getByText("Set Exact");
//     fireEvent.click(modeSelector);

//     const addOption = screen.getByText("Add");
//     fireEvent.click(addOption);

//     const amountInput = screen.getByPlaceholderText("Cantidad");
//     fireEvent.change(amountInput, { target: { value: "50" } });

//     const applyButton = screen.getByText("Aplicar Unidades");
//     fireEvent.click(applyButton);

//     const confirmButton = screen.getByText("Confirmar");
//     fireEvent.click(confirmButton);

//     expect(bulkUpdateAmounts).toHaveBeenCalledWith(
//       ["product-1"],
//       50,
//       "add"
//     );
//   });

//   it("should call bulkUpdateAmounts with correct params (mode: subtract)", async () => {
//     const { bulkUpdateAmounts } = await import("@/actions/stock");

//     render(
//       <BulkUnitUpdate
//         selectedProductIds={["product-1"]}
//         onSuccess={mockOnSuccess}
//       />
//     );

//     const modeSelector = screen.getByText("Set Exact");
//     fireEvent.click(modeSelector);

//     const subtractOption = screen.getByText("Subtract");
//     fireEvent.click(subtractOption);

//     const amountInput = screen.getByPlaceholderText("Cantidad");
//     fireEvent.change(amountInput, { target: { value: "20" } });

//     const applyButton = screen.getByText("Aplicar Unidades");
//     fireEvent.click(applyButton);

//     const confirmButton = screen.getByText("Confirmar");
//     fireEvent.click(confirmButton);

//     expect(bulkUpdateAmounts).toHaveBeenCalledWith(
//       ["product-1"],
//       20,
//       "subtract"
//     );
//   });

//   it("should disable Aplicar button when amount is empty", () => {
//     render(
//       <BulkUnitUpdate
//         selectedProductIds={["product-1"]}
//         onSuccess={mockOnSuccess}
//       />
//     );

//     const applyButton = screen.getByText("Aplicar Unidades");
//     expect(applyButton).toBeDisabled();
//   });

//   it("should disable Aplicar button when no products selected", () => {
//     render(
//       <BulkUnitUpdate
//         selectedProductIds={[]}
//         onSuccess={mockOnSuccess}
//       />
//     );

//     const applyButton = screen.queryByText("Aplicar Unidades");
//     expect(applyButton).not.toBeInTheDocument();
//   });

//   it("should show success feedback after successful update", async () => {
//     const { bulkUpdateAmounts } = await import("@/actions/stock");
//     (bulkUpdateAmounts as any).mockResolvedValue({ success: true });

//     render(
//       <BulkUnitUpdate
//         selectedProductIds={["product-1"]}
//         onSuccess={mockOnSuccess}
//       />
//     );

//     const amountInput = screen.getByPlaceholderText("Cantidad");
//     fireEvent.change(amountInput, { target: { value: "100" } });

//     const applyButton = screen.getByText("Aplicar Unidades");
//     fireEvent.click(applyButton);

//     const confirmButton = screen.getByText("Confirmar");
//     fireEvent.click(confirmButton);

//     await waitFor(() => {
//       expect(mockOnSuccess).toHaveBeenCalled();
//     });
//   });

//   it("should show error feedback after failed update", async () => {
//     const { bulkUpdateAmounts } = await import("@/actions/stock");
//     (bulkUpdateAmounts as any).mockResolvedValue({ success: false, error: "Error al actualizar stock" });

//     render(
//       <BulkUnitUpdate
//         selectedProductIds={["product-1"]}
//         onSuccess={mockOnSuccess}
//       />
//     );

//     const amountInput = screen.getByPlaceholderText("Cantidad");
//     fireEvent.change(amountInput, { target: { value: "100" } });

//     const applyButton = screen.getByText("Aplicar Unidades");
//     fireEvent.click(applyButton);

//     const confirmButton = screen.getByText("Confirmar");
//     fireEvent.click(confirmButton);

//     await waitFor(() => {
//       expect(screen.getByText("Error al actualizar stock")).toBeInTheDocument();
//     });
//   });
// });
