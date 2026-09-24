"use client";

import { CREDIT_NOTE_NON_ACTIONABLE_MESSAGE, type SaleFiscalDiagnostic, type MissingFiscalField } from "@/services/afip/credit-note";

interface Props {
  diagnostic: SaleFiscalDiagnostic & { missingFields?: MissingFiscalField[]; canCompleteFromUser?: boolean };
  onComplete?: () => void;
  recovery?: { missingFields: MissingFiscalField[]; canCompleteFromUser: boolean };
}

const missingLabels: Record<MissingFiscalField, string> = {
  billType: "Tipo de factura",
  invoicePointOfSale: "Punto de venta",
  invoiceNumber: "Número",
};

export default function CreditNoteEligibilityNotice({ diagnostic, onComplete, recovery }: Props) {
  const messages: Record<SaleFiscalDiagnostic["reason"], string> = {
    CAE_INVALID: CREDIT_NOTE_NON_ACTIONABLE_MESSAGE,
    FISCAL_FIELDS_INCOMPLETE: "Los datos fiscales de la venta están incompletos y no permiten ofrecer una Nota de Crédito. Revisá los datos fiscales.",
    FISCAL_TYPE_CONFLICT: CREDIT_NOTE_NON_ACTIONABLE_MESSAGE,
    FISCAL_TYPE_UNSUPPORTED: "El tipo de comprobante de la venta no permite ofrecer una Nota de Crédito.",
    ALREADY_AUTHORIZED: "La venta ya tiene una Nota de Crédito autorizada.",
    SALE_CONTENT_INCOMPLETE: "La venta no tiene un detalle completo para ofrecer una Nota de Crédito.",
    FISCAL_SNAPSHOT_MISSING: "No se puede emitir la Nota de Crédito porque no está disponible el desglose fiscal original. Consulte/recupere el comprobante en ARCA.",
  };

  const recoverableFields = recovery?.missingFields ?? diagnostic.missingFields;
  const recoverable = diagnostic.reason === "FISCAL_FIELDS_INCOMPLETE"
    && (recovery?.canCompleteFromUser === true || diagnostic.canCompleteFromUser === true)
    && (recoverableFields?.length ?? 0) > 0;
  return (
    <section role="status" aria-live="polite" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
      {recoverable ? <>
        <p className="font-medium">Faltan datos del comprobante original para emitir la Nota de Crédito.</p>
        <ul className="mt-2 list-disc pl-5">{recoverableFields?.map((field) => <li key={field}>{missingLabels[field]}</li>)}</ul>
        <p className="mt-2 text-sm">El CAE no puede completarse desde aquí.</p>
        <button type="button" onClick={onComplete} className="mt-3 rounded-lg border border-amber-700 px-3 py-2 font-semibold">Completar datos y revisar</button>
      </> : <p className="font-medium">{messages[diagnostic.reason]}</p>}
      {diagnostic.reason === "ALREADY_AUTHORIZED" && <span className="sr-only">La venta no permite otra Nota de Crédito.</span>}
    </section>
  );
}
