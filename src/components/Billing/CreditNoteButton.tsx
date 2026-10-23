"use client";

import { Component, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { useRouter } from "next/navigation";
import type { CreateCreditNoteResult } from "@/actions/sales/credit-note";
import type { MissingFiscalData } from "./CreditNoteMissingDataModal";
import CreditNoteMissingDataModal from "./CreditNoteMissingDataModal";
import type { SaleFiscalContext, SaleFiscalRecovery } from "@/services/afip/credit-note";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface CreditNoteButtonProps {
  sale: SaleFiscalContext | SaleFiscalRecovery | { readonly [key: string]: unknown };
  createCreditNote: (input: { orderId: string; confirmed: true; idempotencyKey: string; missingFiscalData?: MissingFiscalData }) => Promise<CreateCreditNoteResult>;
}

function RefreshAfterSuccess() {
  const router = useRouter();
  useEffect(() => { try { router.refresh(); } catch { /* success is already persisted */ } }, [router]);
  return null;
}

interface RefreshBoundaryState { hasError: boolean; }
class RefreshBoundary extends Component<PropsWithChildren, RefreshBoundaryState> {
  state: RefreshBoundaryState = { hasError: false };
  static getDerivedStateFromError(): RefreshBoundaryState { return { hasError: true }; }
  render() { return this.state.hasError ? null : this.props.children; }
}

export function CreditNoteButton({ sale, createCreditNote }: CreditNoteButtonProps) {
  const canonical = sale as SaleFiscalContext;
  const recovery = sale as SaleFiscalRecovery;
  const legacy = sale as SaleFiscalContext & { id?: string; items?: Array<{ id: string; description?: string; amount?: number }> };
  const isRecovery = Array.isArray(recovery.missingFields) && recovery.missingFields.length > 0;
  const isLegacy = canonical.eligibleForFullCreditNote === undefined && typeof legacy.id === "string";
  const eligible = canonical.eligibleForFullCreditNote === true || isRecovery || (isLegacy && !!canonical.billType && typeof canonical.invoiceNumber === "number" && typeof canonical.invoicePointOfSale === "number");
  const orderId = canonical.orderId ?? legacy.id ?? recovery.orderId ?? "";
  const products = canonical.products ?? legacy.items?.map((item) => ({ id: item.id, description: item.description ?? "", amount: item.amount ?? 0, salePrice: 0 })) ?? recovery.products ?? [];
  const status = canonical.creditNote?.status ?? recovery.creditNoteStatus;
  const [result, setResult] = useState<CreateCreditNoteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [armed, setArmed] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const [missingData, setMissingData] = useState<MissingFiscalData | undefined>();
  const submitting = useRef(false);
  const key = useRef(`credit-note-${orderId}-${crypto.randomUUID()}`);

  const invoke = async () => {
    if (loading || submitting.current) return;
    submitting.current = true;
    setLoading(true);
    try {
      const response = await createCreditNote({ orderId, confirmed: true, idempotencyKey: key.current, ...(missingData ? { missingFiscalData: missingData } : {}) });
      setResult(response);
      if (response.success) setArmed(false);
    } catch {
      setResult({ success: false, error: "No se pudo comunicar con el servicio de Nota de Crédito", code: "INTERNAL_ERROR" });
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  const submit = async () => {
    if (loading || submitting.current || (isRecovery && missingData)) return;
    if (!armed) { setArmed(true); return; }
    await invoke();
  };

  if (!eligible || status === "AUTHORIZED") return null;
  if (result?.success === false && result.pending) {
    return <section role="status" className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4" aria-live="polite">
      <p>{result.canFinalizeLocally
        ? "La respuesta de ARCA está guardada. Se puede completar la finalización local sin volver a emitir."
        : "El resultado de ARCA requiere conciliación. No intente emitir la Nota de Crédito nuevamente."}</p>
      {result.canFinalizeLocally
        ? <button type="button" onClick={() => void invoke()} disabled={loading} className="rounded-lg bg-amber-700 px-4 py-2 text-white disabled:opacity-60">
          {loading ? "Finalizando localmente…" : "Finalizar operación localmente"}
        </button>
        : <button type="button" disabled className="rounded-lg bg-amber-700 px-4 py-2 text-white">Confirmar devolución — requiere conciliación</button>}
    </section>;
  }
  if (status === "PENDING") {
    const canFinalizeLocally = canonical.creditNote?.canFinalizeLocally === true;
    return <section role="status" className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4" aria-live="polite">
      <p>{canFinalizeLocally
        ? "La respuesta de ARCA está guardada. Se puede completar la finalización local sin volver a emitir."
        : "Nota de Crédito pendiente; requiere conciliación con ARCA. No intente emitirla nuevamente."}</p>
      {canFinalizeLocally
        ? <button type="button" onClick={() => void invoke()} disabled={loading} className="rounded-lg bg-amber-700 px-4 py-2 text-white disabled:opacity-60">
          {loading ? "Finalizando localmente…" : "Finalizar operación localmente"}
        </button>
        : <button type="button" disabled className="rounded-lg bg-amber-700 px-4 py-2 text-white">Confirmar devolución — requiere conciliación</button>}
      {result?.success === false && <p role="status">{result.error}</p>}
      {result?.success === true && <><p role="status">Nota de Crédito #{result.data.creditNoteNumber} finalizada correctamente.</p><RefreshBoundary><RefreshAfterSuccess /></RefreshBoundary></>}
    </section>;
  }
  const afterMissingData = (data: MissingFiscalData) => { setMissingData(data); setMissingOpen(false); setArmed(true); };

  return <section className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4" aria-live="polite">
    {isRecovery && <CreditNoteMissingDataModal open={missingOpen} onOpenChange={setMissingOpen} missingFields={recovery.missingFields} onContinue={afterMissingData} />}
    <button type="button" onClick={() => isRecovery && !armed ? setMissingOpen(true) : submit()} disabled={loading} aria-describedby="credit-note-warning" className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-60">{isRecovery && !armed ? "Completar datos y revisar" : armed ? "Confirmar emisión de Nota de Crédito" : "Revisar Nota de Crédito"}</button>
    {isLegacy ? <div role="dialog" aria-modal="true" aria-labelledby="credit-note-title" className="space-y-3">
       <h2 id="credit-note-title" className="font-semibold">Confirmación de devolución fiscal</h2><p>Comprobante original: {canonical.billType} #{canonical.invoiceNumber} (punto de venta {canonical.invoicePointOfSale})</p><p>CAE original: {canonical.originalCAE}</p><ul>{products.map((item) => <li key={item.id}>{item.description} × {item.amount}</li>)}</ul><p id="credit-note-warning" className="font-bold">Emitir Nota de Crédito completa, restaurar stock y devolver ${canonical.total} en efectivo</p><button type="button" onClick={submit} disabled={loading || !armed} className="rounded-lg bg-red-700 px-4 py-2 text-white">{loading ? "Procesando…" : "Confirmar devolución"}</button>{armed && !loading && !result && <button type="button" onClick={() => setArmed(false)} className="rounded-lg border px-4 py-2">Cancelar</button>}
    </div> : <Dialog open={armed} onOpenChange={setArmed}><DialogContent><DialogHeader><DialogTitle>Confirmación de devolución fiscal</DialogTitle><DialogDescription>Revisá la reversión completa antes de emitir.</DialogDescription></DialogHeader><p>Comprobante original: {canonical.billType ?? recovery.known?.billType} #{canonical.invoiceNumber ?? recovery.known?.invoiceNumber} (punto de venta {canonical.invoicePointOfSale ?? recovery.known?.invoicePointOfSale})</p><p id="credit-note-warning" className="font-bold">Emitir Nota de Crédito completa, restaurar stock y devolver ${canonical.total ?? recovery.total} en efectivo</p><DialogFooter><button type="button" onClick={() => setArmed(false)} className="rounded-lg border px-4 py-2">Cancelar</button><button type="button" onClick={submit} disabled={loading} className="rounded-lg bg-red-700 px-4 py-2 text-white">{loading ? "Procesando…" : "Confirmar devolución"}</button></DialogFooter></DialogContent></Dialog>}
    {result?.success === false && <p role="status">{result.error}</p>}{result?.success === true && <p role="status">Nueva Nota de Crédito #{result.data.creditNoteNumber} ({result.data.creditNoteCAE}) emitida correctamente.</p>}{result?.success === true && <RefreshBoundary><RefreshAfterSuccess /></RefreshBoundary>}
  </section>;
}

export default CreditNoteButton;
