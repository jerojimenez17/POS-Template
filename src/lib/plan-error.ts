export interface ParsedPlanError {
  isPlanError: boolean;
  variant: "feature" | "limit" | null;
  feature?: string;
  resource?: string;
  limitValue?: number;
}

/**
 * Detecta si un mensaje de error corresponde a un bloqueo de plan (feature o límite).
 * Útil para componentes cliente que necesitan mostrar el FeatureBlockedModal
 * en vez de un toast.
 *
 * Uso:
 *   const parsed = parsePlanError(result.error);
 *   if (parsed.isPlanError) {
 *     setPlanError(parsed);
 *     setOpenPlanModal(true);
 *   } else {
 *     toast.error(result.error);
 *   }
 */
export function parsePlanError(error: string): ParsedPlanError {
  if (!error) return { isPlanError: false, variant: null };

  // Feature no disponible en el plan
  if (
    error.includes("no está habilitada") ||
    error.includes("no está disponible") ||
    error.includes("no incluida en tu plan") ||
    error.includes("no está incluida")
  ) {
    return { isPlanError: true, variant: "feature", feature: extractFeature(error) };
  }

  // Límite del plan alcanzado: "Has superado el límite permitido de maxProducts (100)..."
  const limitMatch = error.match(/límite permitido de (\w+)\s*\((\d+)\)/i);
  if (limitMatch) {
    const rawResource = limitMatch[1]; // ej: "maxProducts", "maxUsers"
    const value = parseInt(limitMatch[2], 10);
    const resource = rawResource.replace(/^max/i, "").toLowerCase(); // "products", "users"
    return { isPlanError: true, variant: "limit", resource, limitValue: value };
  }

  // Otra mención de límite
  if (error.toLowerCase().includes("límite") || error.toLowerCase().includes("superado")) {
    return { isPlanError: true, variant: "limit", resource: extractResource(error) };
  }

  return { isPlanError: false, variant: null };
}

function extractFeature(error: string): string | undefined {
  const featureMap: Record<string, string> = {
    afip: "Facturación electrónica (ARCA)",
    billing: "Facturación electrónica (ARCA)",
    budget: "Presupuestos",
    catalog: "Catálogo público",
    "public-catalog": "Catálogo público",
    "hasAfipBilling": "Facturación electrónica (ARCA)",
    "hasPublicCatalog": "Catálogo público",
    "hasClientLedger": "Cuenta Corriente",
    "hasMultiCashbox": "Múltiples cajas",
    "hasSupplierFilter": "Filtro por proveedor",
    "hasBudget": "Presupuestos",
  };

  for (const [key, label] of Object.entries(featureMap)) {
    if (error.toLowerCase().includes(key.toLowerCase())) {
      return label;
    }
  }
  return undefined;
}

function extractResource(error: string): string | undefined {
  if (error.includes("product")) return "productos";
  if (error.includes("user")) return "usuarios";
  if (error.includes("client")) return "clientes";
  return undefined;
}
