export type OriginalCreditNoteBillType = "Factura A" | "Factura B" | "Factura C";
export type CreditNoteBillType = "Nota de Crédito A" | "Nota de Crédito B" | "Nota de Crédito C";

export interface OriginalVoucherMetadata {
  billType: OriginalCreditNoteBillType;
  afipVoucherType: 1 | 6 | 11;
  number: number;
  pointOfSale: number;
  issuedAt?: Date;
}

export interface CreditNoteMetadata {
  status: "PENDING" | "AUTHORIZED" | "REJECTED";
  canFinalizeLocally?: boolean;
  billType?: CreditNoteBillType;
  afipVoucherType?: 3 | 8 | 13;
  number?: number;
  pointOfSale?: number;
  cae?: string;
  originalBillType: OriginalCreditNoteBillType;
  originalCae: string;
  originalAfipVoucherType?: 1 | 6 | 11;
  originalNumber: number;
  originalPointOfSale: number;
}

export interface CreditNotePrintContext {
  documentKind: "credit-note";
  creditNote: CreditNoteMetadata & { status: "AUTHORIZED"; cae: string; number: number; pointOfSale: number };
  original: { billType: OriginalCreditNoteBillType; cae: string; number: number; pointOfSale: number };
  products: Array<{ description: string; amount: number; unitPrice: number; subtotal: number }>;
  total: number;
}
