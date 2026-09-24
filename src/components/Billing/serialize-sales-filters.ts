import type FiltersState from "@/models/FiltersState";
import type { SalesFilters } from "@/actions/sales/get-sales";
import { persistedPaymentMethods } from "@/utils/payment-methods";

const paymentKeys = Object.keys(persistedPaymentMethods) as Array<keyof typeof persistedPaymentMethods>;

export const serializeSalesFilters = (state: FiltersState): SalesFilters => {
  const documentTypes: SalesFilters["documentTypes"] = [];
  if (state.Remito.active) documentTypes.push("REMITO");
  // Keep FACTURA_C as the legacy wire token; the action resolves it to A/B/C.
  if (state.FacturaC.active) documentTypes.push("FACTURA_C");
  const paymentMethods = paymentKeys.flatMap((key) =>
    state[key]?.active ? [persistedPaymentMethods[key].toLowerCase()] : []
  );
  const result: SalesFilters = { documentTypes, paymentMethods };
  if (state.Seller.active && state.Seller.filter.trim() && state.Seller.filter !== "Seleccionar Vendedor") result.seller = state.Seller.filter;
  if (state.startDate.active) result.startDate = state.startDate.date.toISOString();
  if (state.endDate.active) result.endDate = state.endDate.date.toISOString();
  return result;
};
