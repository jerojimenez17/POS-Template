export interface BillRowIdentity {
  id: string;
  cartRowId?: string;
}

/** Resolves a bill row's identity without changing its catalog product id. */
export function getBillRowId(product: BillRowIdentity): string {
  return product.cartRowId ?? product.id;
}
