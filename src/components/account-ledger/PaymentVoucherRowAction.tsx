"use client";

import { useState } from "react";
import { FileText, Loader2, Printer, Receipt, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PointOfSaleSelector } from "@/components/account-ledger/PointOfSaleSelector";

type VoucherStatus = "NOT_REQUIRED" | "MISSING" | "FAILED" | "PENDING" | "ISSUING" | "AUTHORIZED" | "UNKNOWN";

interface PaymentVoucherRowActionProps {
  cashMovementId: string;
  amount: number;
  status: VoucherStatus;
  proposedBillType?: string;
  configuredPtoVentas?: number[];
  onCreateOrRetry?: (input: { cashMovementId: string; billType: string; ptoVenta: number }) => Promise<"FAILED" | "UNKNOWN" | void>;
  onReconcile?: (input: { cashMovementId: string }) => Promise<void>;
  onPrint?: (input: { cashMovementId: string }) => Promise<void> | void;
}

const INVOICE_TYPES = ["Factura A", "Factura B", "Factura C"] as const;

function formatAmount(amount: number): string {
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(amount));
}

export function PaymentVoucherRowAction({
  cashMovementId,
  amount,
  status,
  proposedBillType,
  configuredPtoVentas = [],
  onCreateOrRetry,
  onReconcile,
  onPrint,
}: PaymentVoucherRowActionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [billType, setBillType] = useState("");
  const [ptoVenta, setPtoVenta] = useState(configuredPtoVentas[0]?.toString() ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const selectedPtoVenta = Number(ptoVenta);
    if (!billType || !Number.isSafeInteger(selectedPtoVenta) || !configuredPtoVentas.includes(selectedPtoVenta) || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (onCreateOrRetry) {
        const outcome = await onCreateOrRetry({ cashMovementId, billType, ptoVenta: selectedPtoVenta });
        if (outcome === "UNKNOWN") {
          setError("El pago quedó registrado, pero el resultado de la emisión es incierto. Debe verificar emisión y reconciliar el resultado antes de reintentar. No vuelva a emitir hasta confirmar el resultado.");
          setDialogOpen(false);
          return;
        }
        if (outcome === "FAILED") {
          setError("El pago quedó registrado; la factura no se emitió. Puede reintentar la emisión.");
          return;
        }
      }
      setDialogOpen(false);
    } catch {
      setError("No se pudo iniciar la factura. El pago permanece registrado.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = async () => {
    setError(null);
    try {
      await onPrint?.({ cashMovementId });
    } catch {
      setError("No se pudo imprimir el comprobante de este pago. Intente nuevamente.");
    }
  };

  if (status === "AUTHORIZED") {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Print payment voucher"
          title="Imprimir factura de este pago"
          onClick={() => { void handlePrint(); }}
        >
          <Printer className="h-4 w-4" aria-hidden="true" />
        </Button>
        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      </div>
    );
  }

  if (status === "NOT_REQUIRED") {
    return <p className="text-right text-xs text-muted-foreground">Sin emisión AFIP (Remito)</p>;
  }

  if (status === "MISSING") {
    return (
      <p role="status" className="max-w-xs text-right text-xs text-muted-foreground">
        Pago histórico sin reserva fiscal. Requiere revisión manual antes de emitir.
      </p>
    );
  }

  if (status === "UNKNOWN") {
    return (
      <div className="flex max-w-xs flex-col items-end gap-2">
        <p role="alert" className="text-right text-xs text-amber-800 dark:text-amber-300">
          {error ?? "El pago quedó registrado, pero el resultado de la emisión es incierto. No vuelva a emitir hasta confirmar el resultado."}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={verifying || !onReconcile}
          onClick={async () => {
            if (!onReconcile || verifying) return;
            setVerifying(true);
            try {
              await onReconcile({ cashMovementId });
            } finally {
              setVerifying(false);
            }
          }}
        >
          {verifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {verifying ? "Verificando…" : "Verificar emisión"}
        </Button>
      </div>
    );
  }

  if (status === "PENDING" || status === "ISSUING") {
    return (
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon" aria-label="Invoice is processing" disabled>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        </Button>
        <span role="status" className="text-xs text-muted-foreground">
          {status === "PENDING" ? "Pendiente de preparación" : "Emisión en proceso"}
          <span className="sr-only">{status === "PENDING" ? " pending" : " issuing"}</span>
        </span>
      </div>
    );
  }

  const failed = status === "FAILED";
  const failedTypeProposal = failed
    ? INVOICE_TYPES.find((type) => type === proposedBillType) ?? ""
    : "";
  const actionLabel = failed ? "Retry payment" : "Create invoice";

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={actionLabel}
         onClick={() => {
           setBillType(failedTypeProposal);
           setPtoVenta(configuredPtoVentas[0]?.toString() ?? "");
           setDialogOpen(true);
        }}
      >
        <ReceiptText className="mr-2 h-4 w-4" aria-hidden="true" />
        {failed ? "Reintentar factura" : "Crear factura"}
      </Button>
      {failed && <span className="text-xs text-muted-foreground">El pago quedó registrado; la factura no se emitió.</span>}
      {error && !dialogOpen && <p role="alert" className="max-w-xs text-right text-xs text-destructive">{error}</p>}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[95vh] overflow-y-auto gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle className="text-xl flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Facturar pago parcial
            </DialogTitle>
          </DialogHeader>

          <div className="px-6 py-5">
            <div className="grid grid-cols-1 gap-5">
              <section className="bg-card border rounded-xl p-5 shadow-sm self-start">
                <h3 className="text-sm font-semibold text-card-foreground mb-4 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Datos del comprobante
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                      Tipo
                    </Label>
                    <Select value={billType} onValueChange={setBillType}>
                      <SelectTrigger aria-label="Tipo de factura">
                        <SelectValue placeholder="Seleccione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {INVOICE_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                      Punto de venta
                    </Label>
                    <PointOfSaleSelector
                      values={configuredPtoVentas}
                      value={ptoVenta}
                      onChange={setPtoVenta}
                      disabled={configuredPtoVentas.length === 0}
                    />
                    {configuredPtoVentas.length === 0 && (
                      <p className="mt-1 text-xs text-destructive">No hay puntos de venta configurados.</p>
                    )}
                    {ptoVenta && configuredPtoVentas.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">Se emitirá en el punto de venta {ptoVenta}.</p>
                    )}
                  </div>
                </div>
              </section>

              <section className="bg-card border rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-card-foreground mb-4 flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  Pago
                </h3>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-muted-foreground">Importe del pago</span>
                  <span className="text-2xl font-bold font-mono tabular-nums">$ {formatAmount(amount)}</span>
                </div>
              </section>

              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            </div>
          </div>

          <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={submitting}
              onClick={() => setDialogOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!billType || !configuredPtoVentas.includes(Number(ptoVenta)) || submitting}
              onClick={handleCreate}
              className="gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white shadow-sm active:scale-[0.98] transition-all duration-150"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Procesando…
                </>
              ) : (
                "Confirmar"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
