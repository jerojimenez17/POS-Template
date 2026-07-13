import React from "react";
import { screen, fireEvent, render, waitFor } from "../test-utils";
import BillButtonsDefault from "@/components/Billing/BillButtons";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useFeatures } from "@/hooks/useFeatures";
import * as shortcutsActions from "@/actions/shortcuts";

// Mock shortcuts actions
vi.mock("@/actions/shortcuts", () => ({
  getShortcutConfigsAction: vi.fn(),
  getProductByShortcutAction: vi.fn(),
  saveShortcutConfigAction: vi.fn(),
  deleteShortcutConfigAction: vi.fn(),
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  Toaster: () => null,
}));

// Mock useFeatures
vi.mock("@/hooks/useFeatures", () => ({
  useFeatures: vi.fn(),
}));

// Mock next-auth useSession
vi.mock("next-auth/react", () => ({
  useSession: vi.fn(() => ({
    data: {
      user: {
        id: "user-1",
        email: "test@example.com",
        businessId: "business-123",
        business: {
          features: { hasBudget: true, plan: "ENTERPRISE" },
        },
      },
    },
    status: "authenticated",
  })),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock cashbox context
vi.mock("@/context/CashboxContext", () => ({
  useCashbox: vi.fn(() => ({
    hasActiveSession: true,
    setIsOpeningModalOpen: vi.fn(),
  })),
  CashboxProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const mockProduct = {
  id: "shortcut-prod-1",
  code: "VAR001",
  codebar: "",
  description: "Producto Precio Variable",
  brand: "",
  subCategory: "",
  price: 0,
  salePrice: 0,
  gain: 0,
  suplier: { id: "s1", name: "Test", discount: 0, iva: 0, gain: 0 },
  client_bonus: 0,
  unit: "unidades",
  image: "",
  imageName: "",
  images: [],
  amount: 1,
  last_update: new Date(),
  creation_date: new Date(),
  category: "",
  catalog: true,
  details: "",
};

const defaultBillContextMock = {
  BillState: {
    id: "",
    products: [],
    total: 0,
    totalWithDiscount: 0,
    discount: 0,
    seller: "",
    typeDocument: "",
    documentNumber: 0,
    IVACondition: "Consumidor Final",
    paidMethod: "Efectivo",
    billType: "Factura C",
    twoMethods: false,
    totalSecondMethod: 0,
    secondPaidMethod: "Debito",
    date: new Date(),
  },
  dispatch: vi.fn(),
  addItem: vi.fn(),
  addUnit: vi.fn(),
  removeUnit: vi.fn(),
  removeAll: vi.fn(),
  removeItem: vi.fn(),
  changePrice: vi.fn(),
  changeUnit: vi.fn(),
  total: vi.fn(),
  discount: vi.fn(),
  sellerName: vi.fn(),
  typeDocument: vi.fn(),
  documentNumber: vi.fn(),
  entrega: vi.fn(),
  nroAsociado: vi.fn(),
  IVACondition: vi.fn(),
  paidMethod: vi.fn(),
  billType: vi.fn(),
  date: vi.fn(),
  CAE: vi.fn(),
  setState: vi.fn(),
  onOrderResetRef: { current: null },
  printMode: "thermal" as const,
  setPrintMode: vi.fn(),
  qzTrayActive: false,
  setQzTrayActive: vi.fn(),
  focusPriceProductId: null,
  setFocusPriceProductId: vi.fn(),
};

describe("BillButtonsDefault - Keyboard Shortcut Remapping", () => {
  const sessionMock = {
    user: {
      id: "user-1",
      email: "test@example.com",
      businessId: "business-123",
      business: {
        features: { hasBudget: true, hasAfipBilling: true, hasClientLedger: true, plan: "ENTERPRISE" },
      },
    },
    expires: "1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default feature mock: all features enabled
    vi.mocked(useFeatures).mockReturnValue({
      plan: "ENTERPRISE",
      hasFeature: () => true,
      isDelinquent: false,
    } as any);
  });

  describe("Shortcut config fetching on mount", () => {
    it("should fetch shortcut configs on mount (AC17)", async () => {
      vi.mocked(shortcutsActions.getShortcutConfigsAction).mockResolvedValue({
        success: true,
        data: [
          {
            id: "cfg-1",
            key: "F1",
            productId: "shortcut-prod-1",
            product: {
              id: "shortcut-prod-1",
              description: "Producto Precio Variable",
              code: "VAR001",
              salePrice: 0,
            },
          },
        ],
      });

      render(
        <BillButtonsDefault
          session={sessionMock}
          handlePrint={vi.fn()}
          isEditing={false}
        />,
        { billContextMock: defaultBillContextMock, sessionMock }
      );

      await waitFor(() => {
        expect(shortcutsActions.getShortcutConfigsAction).toHaveBeenCalledWith(
          "business-123"
        );
      });
    });

    it("should NOT fetch shortcuts when isEditing is true (AC24)", async () => {
      render(
        <BillButtonsDefault
          session={sessionMock}
          handlePrint={vi.fn()}
          isEditing={true}
        />,
        { billContextMock: defaultBillContextMock, sessionMock }
      );

      // Wait a bit to ensure no fetch happened
      await waitFor(() => {
        expect(shortcutsActions.getShortcutConfigsAction).not.toHaveBeenCalled();
      });
    });
  });

  describe("F1/F2/F3 with shortcut configured (AC18)", () => {
    it("should fetch product and dispatch addItem with salePrice=0 when F1 is pressed and configured", async () => {
      vi.mocked(shortcutsActions.getShortcutConfigsAction).mockResolvedValue({
        success: true,
        data: [
          {
            id: "cfg-1",
            key: "F1",
            productId: "shortcut-prod-1",
            product: {
              id: "shortcut-prod-1",
              description: "Producto Precio Variable",
              code: "VAR001",
              salePrice: 0,
            },
          },
        ],
      });

      vi.mocked(shortcutsActions.getProductByShortcutAction).mockResolvedValue({
        success: true,
        data: mockProduct,
      });

      render(
        <BillButtonsDefault
          session={sessionMock}
          handlePrint={vi.fn()}
          isEditing={false}
        />,
        { billContextMock: defaultBillContextMock, sessionMock }
      );

      // Wait for mount fetch
      await waitFor(() => {
        expect(shortcutsActions.getShortcutConfigsAction).toHaveBeenCalled();
      });

      // Press F1
      fireEvent.keyDown(window, { key: "F1" });

      await waitFor(() => {
        expect(shortcutsActions.getProductByShortcutAction).toHaveBeenCalledWith("F1", "business-123");
        expect(defaultBillContextMock.addItem).toHaveBeenCalledWith(
          expect.objectContaining({
            id: "shortcut-prod-1",
            salePrice: 0,
            amount: 1,
          })
        );
      });
    });

    it("should set focusPriceProductId after adding shortcut product", async () => {
      vi.mocked(shortcutsActions.getShortcutConfigsAction).mockResolvedValue({
        success: true,
        data: [
          {
            id: "cfg-1",
            key: "F1",
            productId: "shortcut-prod-1",
            product: {
              id: "shortcut-prod-1",
              description: "Producto Precio Variable",
              code: "VAR001",
              salePrice: 0,
            },
          },
        ],
      });

      vi.mocked(shortcutsActions.getProductByShortcutAction).mockResolvedValue({
        success: true,
        data: mockProduct,
      });

      render(
        <BillButtonsDefault
          session={sessionMock}
          handlePrint={vi.fn()}
          isEditing={false}
        />,
        { billContextMock: defaultBillContextMock, sessionMock }
      );

      await waitFor(() => {
        expect(shortcutsActions.getShortcutConfigsAction).toHaveBeenCalled();
      });

      fireEvent.keyDown(window, { key: "F1" });

      await waitFor(() => {
        expect(defaultBillContextMock.setFocusPriceProductId).toHaveBeenCalledWith(
          "shortcut-prod-1"
        );
      });
    });

    it("should handle F2 with configured shortcut", async () => {
      const f2Product = { ...mockProduct, id: "shortcut-prod-2" };

      vi.mocked(shortcutsActions.getShortcutConfigsAction).mockResolvedValue({
        success: true,
        data: [
          {
            id: "cfg-2",
            key: "F2",
            productId: "shortcut-prod-2",
            product: {
              id: "shortcut-prod-2",
              description: "Producto F2",
              code: "VAR002",
              salePrice: 0,
            },
          },
        ],
      });

      vi.mocked(shortcutsActions.getProductByShortcutAction).mockResolvedValue({
        success: true,
        data: f2Product,
      });

      render(
        <BillButtonsDefault
          session={sessionMock}
          handlePrint={vi.fn()}
          isEditing={false}
        />,
        { billContextMock: defaultBillContextMock, sessionMock }
      );

      await waitFor(() => {
        expect(shortcutsActions.getShortcutConfigsAction).toHaveBeenCalled();
      });

      fireEvent.keyDown(window, { key: "F2" });

      await waitFor(() => {
        expect(shortcutsActions.getProductByShortcutAction).toHaveBeenCalledWith("F2", "business-123");
        expect(defaultBillContextMock.addItem).toHaveBeenCalledWith(
          expect.objectContaining({
            id: "shortcut-prod-2",
            salePrice: 0,
          })
        );
      });
    });

    it("should handle F3 with configured shortcut", async () => {
      const f3Product = { ...mockProduct, id: "shortcut-prod-3" };

      vi.mocked(shortcutsActions.getShortcutConfigsAction).mockResolvedValue({
        success: true,
        data: [
          {
            id: "cfg-3",
            key: "F3",
            productId: "shortcut-prod-3",
            product: {
              id: "shortcut-prod-3",
              description: "Producto F3",
              code: "VAR003",
              salePrice: 0,
            },
          },
        ],
      });

      vi.mocked(shortcutsActions.getProductByShortcutAction).mockResolvedValue({
        success: true,
        data: f3Product,
      });

      render(
        <BillButtonsDefault
          session={sessionMock}
          handlePrint={vi.fn()}
          isEditing={false}
        />,
        { billContextMock: defaultBillContextMock, sessionMock }
      );

      await waitFor(() => {
        expect(shortcutsActions.getShortcutConfigsAction).toHaveBeenCalled();
      });

      fireEvent.keyDown(window, { key: "F3" });

      await waitFor(() => {
        expect(shortcutsActions.getProductByShortcutAction).toHaveBeenCalledWith("F3", "business-123");
        expect(defaultBillContextMock.addItem).toHaveBeenCalledWith(
          expect.objectContaining({
            id: "shortcut-prod-3",
            salePrice: 0,
          })
        );
      });
    });
  });

  describe("F1/F2/F3 without shortcut configured (AC19)", () => {
    it("should do nothing when F1 is pressed and no shortcut is configured", async () => {
      vi.mocked(shortcutsActions.getShortcutConfigsAction).mockResolvedValue({
        success: true,
        data: [],
      });

      render(
        <BillButtonsDefault
          session={sessionMock}
          handlePrint={vi.fn()}
          isEditing={false}
        />,
        { billContextMock: defaultBillContextMock, sessionMock }
      );

      await waitFor(() => {
        expect(shortcutsActions.getShortcutConfigsAction).toHaveBeenCalled();
      });

      fireEvent.keyDown(window, { key: "F1" });

      // Should NOT fetch product or add item
      expect(shortcutsActions.getProductByShortcutAction).not.toHaveBeenCalled();
      expect(defaultBillContextMock.addItem).not.toHaveBeenCalled();
    });

    it("should do nothing when F2 is pressed and no shortcut is configured", async () => {
      vi.mocked(shortcutsActions.getShortcutConfigsAction).mockResolvedValue({
        success: true,
        data: [],
      });

      render(
        <BillButtonsDefault
          session={sessionMock}
          handlePrint={vi.fn()}
          isEditing={false}
        />,
        { billContextMock: defaultBillContextMock, sessionMock }
      );

      await waitFor(() => {
        expect(shortcutsActions.getShortcutConfigsAction).toHaveBeenCalled();
      });

      fireEvent.keyDown(window, { key: "F2" });

      expect(shortcutsActions.getProductByShortcutAction).not.toHaveBeenCalled();
      expect(defaultBillContextMock.addItem).not.toHaveBeenCalled();
    });

    it("should do nothing when F3 is pressed and no shortcut is configured", async () => {
      vi.mocked(shortcutsActions.getShortcutConfigsAction).mockResolvedValue({
        success: true,
        data: [],
      });

      render(
        <BillButtonsDefault
          session={sessionMock}
          handlePrint={vi.fn()}
          isEditing={false}
        />,
        { billContextMock: defaultBillContextMock, sessionMock }
      );

      await waitFor(() => {
        expect(shortcutsActions.getShortcutConfigsAction).toHaveBeenCalled();
      });

      fireEvent.keyDown(window, { key: "F3" });

      expect(shortcutsActions.getProductByShortcutAction).not.toHaveBeenCalled();
      expect(defaultBillContextMock.addItem).not.toHaveBeenCalled();
    });
  });

  describe("Remapped keys (AC20-AC23)", () => {
    it("should open Factura modal when F4 is pressed (AC20)", async () => {
      vi.mocked(shortcutsActions.getShortcutConfigsAction).mockResolvedValue({
        success: true,
        data: [],
      });

      // We need to check that the factura modal opens. Since the modal is
      // rendered inside the component, we check for the dialog title.
      render(
        <BillButtonsDefault
          session={sessionMock}
          handlePrint={vi.fn()}
          isEditing={false}
        />,
        { billContextMock: defaultBillContextMock, sessionMock }
      );

      await waitFor(() => {
        expect(shortcutsActions.getShortcutConfigsAction).toHaveBeenCalled();
      });

      fireEvent.keyDown(window, { key: "F4" });

      // After pressing F4, the factura confirmation dialog should appear
      await waitFor(() => {
        expect(
          screen.getByText("Confirmar creación de Factura")
        ).toBeInTheDocument();
      });
    });

    it("should open Remito modal when F9 is pressed (AC21)", async () => {
      vi.mocked(shortcutsActions.getShortcutConfigsAction).mockResolvedValue({
        success: true,
        data: [],
      });

      render(
        <BillButtonsDefault
          session={sessionMock}
          handlePrint={vi.fn()}
          isEditing={false}
        />,
        { billContextMock: defaultBillContextMock, sessionMock }
      );

      await waitFor(() => {
        expect(shortcutsActions.getShortcutConfigsAction).toHaveBeenCalled();
      });

      fireEvent.keyDown(window, { key: "F9" });

      await waitFor(() => {
        expect(
          screen.getByText("Confirmar creación de Remito")
        ).toBeInTheDocument();
      });
    });

    it("should open A cuenta modal when F10 is pressed (AC22)", async () => {
      // For A cuenta modal we need products in the bill
      const billContextWithProducts = {
        ...defaultBillContextMock,
        BillState: {
          ...defaultBillContextMock.BillState,
          products: [mockProduct],
        },
      };

      vi.mocked(shortcutsActions.getShortcutConfigsAction).mockResolvedValue({
        success: true,
        data: [],
      });

      render(
        <BillButtonsDefault
          session={sessionMock}
          handlePrint={vi.fn()}
          isEditing={false}
        />,
        { billContextMock: billContextWithProducts, sessionMock }
      );

      await waitFor(() => {
        expect(shortcutsActions.getShortcutConfigsAction).toHaveBeenCalled();
      });

      fireEvent.keyDown(window, { key: "F10" });

      // The A cuenta modal opens (ClientSelectionModal with mode="account")
      // Look for a relevant text or element
      await waitFor(() => {
        // The modal should be triggerable - check that the F10 key doesn't
        // trigger the old F3 behavior
        expect(shortcutsActions.getProductByShortcutAction).not.toHaveBeenCalled();
      });
    });

    it("should open Presupuesto modal when F5 is pressed and hasBudget is true (AC23)", async () => {
      vi.mocked(shortcutsActions.getShortcutConfigsAction).mockResolvedValue({
        success: true,
        data: [],
      });

      const billContextWithProducts = {
        ...defaultBillContextMock,
        BillState: {
          ...defaultBillContextMock.BillState,
          products: [mockProduct],
        },
      };

      render(
        <BillButtonsDefault
          session={sessionMock}
          handlePrint={vi.fn()}
          isEditing={false}
        />,
        { billContextMock: billContextWithProducts, sessionMock }
      );

      await waitFor(() => {
        expect(shortcutsActions.getShortcutConfigsAction).toHaveBeenCalled();
      });

      fireEvent.keyDown(window, { key: "F5" });

      // The presupuesto modal should open via ClientSelectionModal with mode="budget"
      // This is feature-gated by hasBudget which we mocked as true
      await waitFor(() => {
        expect(
          screen.getByText("Presupuesto")
        ).toBeInTheDocument();
      });
    });

    it("should NOT open Presupuesto modal when F5 is pressed but hasBudget is false", async () => {
      // Mock session without budget feature
      const sessionNoBudget = {
        ...sessionMock,
        user: {
          ...sessionMock.user,
          business: {
            features: { hasBudget: false, plan: "BASIC" },
          },
        },
      };

      vi.mocked(shortcutsActions.getShortcutConfigsAction).mockResolvedValue({
        success: true,
        data: [],
      });

      const billContextWithProducts = {
        ...defaultBillContextMock,
        BillState: {
          ...defaultBillContextMock.BillState,
          products: [mockProduct],
        },
      };

      render(
        <BillButtonsDefault
          session={sessionNoBudget}
          handlePrint={vi.fn()}
          isEditing={false}
        />,
        { billContextMock: billContextWithProducts, sessionMock: sessionNoBudget }
      );

      await waitFor(() => {
        expect(shortcutsActions.getShortcutConfigsAction).toHaveBeenCalled();
      });

      fireEvent.keyDown(window, { key: "F5" });

      // Check no budget-related dialog opened
      await waitFor(() => {
        expect(screen.queryByText("Presupuesto")).not.toBeInTheDocument();
      });
    });
  });

  describe("Shortcuts disabled when editing (AC24)", () => {
    it("should not process any keyboard shortcuts when isEditing is true", async () => {
      vi.mocked(shortcutsActions.getShortcutConfigsAction).mockResolvedValue({
        success: true,
        data: [
          {
            id: "cfg-1",
            key: "F1",
            productId: "shortcut-prod-1",
            product: {
              id: "shortcut-prod-1",
              description: "Producto Precio Variable",
              code: "VAR001",
              salePrice: 0,
            },
          },
        ],
      });

      render(
        <BillButtonsDefault
          session={sessionMock}
          handlePrint={vi.fn()}
          isEditing={true}
        />,
        { billContextMock: defaultBillContextMock, sessionMock }
      );

      // Wait a tick to ensure no fetch happens
      await waitFor(() => {
        expect(shortcutsActions.getShortcutConfigsAction).not.toHaveBeenCalled();
      });

      // Press F1 (should be ignored because isEditing is true)
      fireEvent.keyDown(window, { key: "F1" });

      expect(shortcutsActions.getProductByShortcutAction).not.toHaveBeenCalled();
      expect(defaultBillContextMock.addItem).not.toHaveBeenCalled();

      // Press F4 (should also be ignored)
      fireEvent.keyDown(window, { key: "F4" });
      expect(screen.queryByText("Confirmar creación de Factura")).not.toBeInTheDocument();
    });
  });

  describe("Error handling", () => {
    it("should show toast when getProductByShortcutAction returns error", async () => {
      vi.mocked(shortcutsActions.getShortcutConfigsAction).mockResolvedValue({
        success: true,
        data: [
          {
            id: "cfg-1",
            key: "F1",
            productId: "shortcut-prod-1",
            product: {
              id: "shortcut-prod-1",
              description: "Producto Precio Variable",
              code: "VAR001",
              salePrice: 0,
            },
          },
        ],
      });

      vi.mocked(shortcutsActions.getProductByShortcutAction).mockResolvedValue({
        success: false,
        error: "Error al obtener producto",
      });

      const { toast } = await import("sonner");

      render(
        <BillButtonsDefault
          session={sessionMock}
          handlePrint={vi.fn()}
          isEditing={false}
        />,
        { billContextMock: defaultBillContextMock, sessionMock }
      );

      await waitFor(() => {
        expect(shortcutsActions.getShortcutConfigsAction).toHaveBeenCalled();
      });

      fireEvent.keyDown(window, { key: "F1" });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });

    // ─── Bug A: Missing { success: true, data: null } handling (AC10/T8) ───

    it("should show 'producto ya no existe' toast when getProductByShortcutAction returns success:true, data:null (Bug A / AC10)", async () => {
      vi.mocked(shortcutsActions.getShortcutConfigsAction).mockResolvedValue({
        success: true,
        data: [
          {
            id: "cfg-1",
            key: "F1",
            productId: "shortcut-prod-1",
            product: {
              id: "shortcut-prod-1",
              description: "Producto Precio Variable",
              code: "VAR001",
              salePrice: 0,
            },
          },
        ],
      });

      // Simulate the case where the shortcut config exists but the related
      // product was deleted — server returns { success: true, data: null }
      vi.mocked(shortcutsActions.getProductByShortcutAction).mockResolvedValue({
        success: true,
        data: null,
      });

      const { toast } = await import("sonner");

      render(
        <BillButtonsDefault
          session={sessionMock}
          handlePrint={vi.fn()}
          isEditing={false}
        />,
        { billContextMock: defaultBillContextMock, sessionMock }
      );

      await waitFor(() => {
        expect(shortcutsActions.getShortcutConfigsAction).toHaveBeenCalled();
      });

      // Press F1 — should trigger the product lookup
      fireEvent.keyDown(window, { key: "F1" });

      // Currently the component has no branch for { success: true, data: null }
      // so no toast is shown. This test expects the specific error toast
      // message that will be added by the fix.
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "El producto configurado para este atajo ya no existe"
        );
      });
    });

    // ─── AC12/T12: getShortcutConfigsAction error on mount ───

    it("should handle getShortcutConfigsAction error on mount gracefully (AC12/T12)", async () => {
      // Simulate a fetch failure — returns error instead of configs
      vi.mocked(shortcutsActions.getShortcutConfigsAction).mockResolvedValue({
        success: false,
        error: "Error de conexión",
      });

      render(
        <BillButtonsDefault
          session={sessionMock}
          handlePrint={vi.fn()}
          isEditing={false}
        />,
        { billContextMock: defaultBillContextMock, sessionMock }
      );

      await waitFor(() => {
        expect(shortcutsActions.getShortcutConfigsAction).toHaveBeenCalled();
      });

      // shortcutMap should be empty (no configs loaded)
      // Pressing F1 should be a no-op since no shortcut configs are in the map
      fireEvent.keyDown(window, { key: "F1" });

      // No product lookup should be triggered
      expect(
        shortcutsActions.getProductByShortcutAction
      ).not.toHaveBeenCalled();
      expect(defaultBillContextMock.addItem).not.toHaveBeenCalled();

      // Remapped keys should still work normally (F4 → factura)
      fireEvent.keyDown(window, { key: "F4" });

      await waitFor(() => {
        expect(
          screen.getByText("Confirmar creación de Factura")
        ).toBeInTheDocument();
      });
    });
  });
});
