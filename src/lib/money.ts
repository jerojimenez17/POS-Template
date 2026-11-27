/** Normalize a finite, non-negative ARS amount to whole pesos. */
export const MAX_WHOLE_PESO_AMOUNT = 9_999_999_999;

export const toWholePesos = (amount: number): number | null => {
  if (!Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER) return null;

  const pesos = Math.round(amount);
  return Number.isSafeInteger(pesos) ? pesos : null;
};

/** Normalize a positive user-entered ARS amount and require at least one peso. */
export const toPositiveWholePesos = (amount: number): number | null => {
  const pesos = toWholePesos(amount);
  return pesos !== null && pesos >= 1 && pesos <= MAX_WHOLE_PESO_AMOUNT ? pesos : null;
};
