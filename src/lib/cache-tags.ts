export const CACHE_TAGS = {
  STOCK: "stock",
  SALES: "sales",
  CLIENTS: "clients",
  ORDERS: "orders",
  CASHBOX: "cashbox",
  MOVEMENTS: "movements",
  BUSINESS: "business",
  SUPERADMIN: "superadmin",
  CATALOG: "catalog",
  ARCA: "arca",
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];
