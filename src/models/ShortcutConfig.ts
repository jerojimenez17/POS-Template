// Domain type matching what the UI needs
export interface ShortcutConfigView {
  id: string;
  key: "F1" | "F2" | "F3";
  productId: string;
  product: {
    id: string;
    description: string;
    code: string;
    salePrice: number;
  } | null;
}

// Type for the action input
export type ShortcutKey = "F1" | "F2" | "F3";

// Map used in the bill page
export type ShortcutMap = Partial<Record<ShortcutKey, string>>; // key → productId
