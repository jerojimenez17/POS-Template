"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { MissingFiscalField, OriginalBillType } from "@/services/afip/credit-note";

export interface MissingFiscalData {
  billType?: OriginalBillType;
  invoicePointOfSale?: number;
  invoiceNumber?: number;
}

interface Props {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  missingFields: MissingFiscalField[];
  onContinue: (data: MissingFiscalData) => void;
  onCancel?: () => void;
}

const labels: Record<MissingFiscalField, string> = {
  billType: "Tipo de factura",
  invoicePointOfSale: "Punto de venta",
  invoiceNumber: "Número",
};

export function CreditNoteMissingDataModal({ open, onOpenChange, missingFields, onContinue, onCancel }: Props) {
  const [billType, setBillType] = useState("");
  const [point, setPoint] = useState("");
  const [number, setNumber] = useState("");
  const [errors, setErrors] = useState<Partial<Record<MissingFiscalField, string>>>({});

  const submit = () => {
    const next: Partial<Record<MissingFiscalField, string>> = {};
    if (missingFields.includes("billType") && !["Factura A", "Factura B", "Factura C"].includes(billType)) next.billType = billType ? "Elegí Factura A, B o C" : "Completá este dato";
    const validateNumber = (value: string): string | undefined => /^(?:[1-9]\d*)$/.test(value) ? undefined : "Ingresá un número entero mayor que cero";
    if (missingFields.includes("invoicePointOfSale")) next.invoicePointOfSale = validateNumber(point);
    if (missingFields.includes("invoiceNumber")) next.invoiceNumber = validateNumber(number);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onContinue({
      ...(missingFields.includes("billType") ? { billType: billType as OriginalBillType } : {}),
      ...(missingFields.includes("invoicePointOfSale") ? { invoicePointOfSale: Number(point) } : {}),
      ...(missingFields.includes("invoiceNumber") ? { invoiceNumber: Number(number) } : {}),
    });
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent aria-describedby="credit-note-missing-description">
      <DialogHeader>
        <DialogTitle>Completar datos del comprobante original</DialogTitle>
        <DialogDescription id="credit-note-missing-description">Ingresá únicamente los datos que faltan. Se validarán nuevamente antes de emitir.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        {missingFields.includes("billType") && <label className="block space-y-1">{labels.billType}<select aria-label={labels.billType} value={billType} onChange={(event) => setBillType(event.target.value)} className="w-full rounded-md border p-2"><option value="">Seleccionar</option><option>Factura A</option><option>Factura B</option><option>Factura C</option></select>{errors.billType && <span role="alert" className="text-sm text-red-700">{errors.billType}</span>}</label>}
        {missingFields.includes("invoicePointOfSale") && <label className="block space-y-1">{labels.invoicePointOfSale}<input aria-label={labels.invoicePointOfSale} inputMode="numeric" value={point} onChange={(event) => setPoint(event.target.value)} className="w-full rounded-md border p-2" />{errors.invoicePointOfSale && <span role="alert" className="text-sm text-red-700">{errors.invoicePointOfSale}</span>}</label>}
        {missingFields.includes("invoiceNumber") && <label className="block space-y-1">{labels.invoiceNumber}<input aria-label={labels.invoiceNumber} inputMode="numeric" value={number} onChange={(event) => setNumber(event.target.value)} className="w-full rounded-md border p-2" />{errors.invoiceNumber && <span role="alert" className="text-sm text-red-700">{errors.invoiceNumber}</span>}</label>}
        <p className="text-sm font-medium">El CAE original no se solicita ni se genera automáticamente.</p>
      </div>
      <DialogFooter><button type="button" onClick={() => { onOpenChange?.(false); onCancel?.(); }} className="rounded-md border px-4 py-2">Cancelar</button><button type="button" onClick={submit} className="rounded-md bg-blue-600 px-4 py-2 text-white">Continuar a confirmación</button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

export default CreditNoteMissingDataModal;
