export interface ResolvedFeatures {
  plan: string;
  hasAfipBilling: boolean;
  hasPublicCatalog: boolean;
  hasClientLedger: boolean;
  hasMultiCashbox: boolean;
  hasSupplierFilter: boolean;
  hasBudget: boolean;
  maxUsers: number;
  maxProducts: number;
  maxCashboxes: number;
  maxClients: number;
  dailySalesLimit: number;
  dailyProductsLimit: number;
  dailyClientsLimit: number;
}

export interface PlanSeed {
  name: string;
  description?: string;
  features: Omit<ResolvedFeatures, "plan" | "maxUsers" | "maxProducts" | "maxCashboxes" | "maxClients" | "dailySalesLimit" | "dailyProductsLimit" | "dailyClientsLimit">;
  limits: Pick<ResolvedFeatures, "maxUsers" | "maxProducts" | "maxCashboxes" | "maxClients" | "dailySalesLimit" | "dailyProductsLimit" | "dailyClientsLimit">;
  isDefault?: boolean;
  isActive?: boolean;
  displayOrder?: number;
}

export const PLAN_SEEDS: PlanSeed[] = [
  {
    name: "BASIC",
    description: "Plan básico para negocios pequeños",
    features: {
      hasAfipBilling: false,
      hasPublicCatalog: false,
      hasClientLedger: false,
      hasMultiCashbox: false,
      hasSupplierFilter: false,
      hasBudget: false,
    },
    limits: {
      maxUsers: 1,
      maxProducts: 100,
      maxCashboxes: 1,
      maxClients: 50,
      dailySalesLimit: 999999,
      dailyProductsLimit: 999999,
      dailyClientsLimit: 999999,
    },
    isDefault: true,
    displayOrder: 1,
  },
  {
    name: "PRO",
    description: "Plan profesional para negocios en crecimiento",
    features: {
      hasAfipBilling: true,
      hasPublicCatalog: true,
      hasClientLedger: true,
      hasMultiCashbox: true,
      hasSupplierFilter: true,
      hasBudget: true,
    },
    limits: {
      maxUsers: 5,
      maxProducts: 1000,
      maxCashboxes: 3,
      maxClients: 500,
      dailySalesLimit: 999999,
      dailyProductsLimit: 999999,
      dailyClientsLimit: 999999,
    },
    displayOrder: 2,
  },
  {
    name: "ENTERPRISE",
    description: "Plan empresarial sin límites",
    features: {
      hasAfipBilling: true,
      hasPublicCatalog: true,
      hasClientLedger: true,
      hasMultiCashbox: true,
      hasSupplierFilter: true,
      hasBudget: true,
    },
    limits: {
      maxUsers: 999999,
      maxProducts: 999999,
      maxCashboxes: 999999,
      maxClients: 999999,
      dailySalesLimit: 999999,
      dailyProductsLimit: 999999,
      dailyClientsLimit: 999999,
    },
    displayOrder: 3,
  },
  {
    name: "DEMO",
    description: "Plan de prueba gratuito por 30 días",
    features: {
      hasAfipBilling: true,
      hasPublicCatalog: true,
      hasClientLedger: true,
      hasMultiCashbox: true,
      hasSupplierFilter: true,
      hasBudget: true,
    },
    limits: {
      maxUsers: 2,
      maxProducts: 10,
      maxCashboxes: 2,
      maxClients: 2,
      dailySalesLimit: 3,
      dailyProductsLimit: 5,
      dailyClientsLimit: 2,
    },
    displayOrder: 0,
  },
  {
    name: "CUSTOM",
    description: "Plan personalizado con configuración a medida",
    features: {
      hasAfipBilling: true,
      hasPublicCatalog: true,
      hasClientLedger: true,
      hasMultiCashbox: true,
      hasSupplierFilter: true,
      hasBudget: true,
    },
    limits: {
      maxUsers: 999999,
      maxProducts: 999999,
      maxCashboxes: 999999,
      maxClients: 999999,
      dailySalesLimit: 999999,
      dailyProductsLimit: 999999,
      dailyClientsLimit: 999999,
    },
    displayOrder: 99,
  },
];
