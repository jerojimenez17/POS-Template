export const persistedPaymentMethods = {
  Debito: "Debito",
  UnPago: "Credito 1 pago",
  Ahora3: "Ahora 3",
  Ahora6: "Ahora 6",
  Transferencia: "Transferencia",
  Efectivo: "Efectivo",
  CuentaDNI: "Cuenta DNI",
} as const;

type PersistedPaymentMethod = (typeof persistedPaymentMethods)[keyof typeof persistedPaymentMethods];

const aliases: Record<string, PersistedPaymentMethod> = Object.fromEntries(
  Object.entries(persistedPaymentMethods).flatMap(([key, value]) => [
    [key.toLowerCase(), value],
    [value.toLowerCase(), value],
    [value.toLowerCase().replaceAll(" ", ""), value],
  ]),
) as Record<string, PersistedPaymentMethod>;

export const normalizePaymentMethod = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  return aliases[normalized] ?? aliases[normalized.replaceAll(" ", "")] ?? value.trim();
};
