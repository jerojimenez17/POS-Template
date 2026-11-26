"use client";

import { useState } from "react";
import { Loader2, Printer, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
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

      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={`payment-voucher-title-${cashMovementId}`}
            className="w-full max-w-sm space-y-5 rounded-lg border bg-background p-5 shadow-xl"
          >
            <div>
              <h2 id={`payment-voucher-title-${cashMovementId}`} className="text-lg font-semibold">
                Facturar pago parcial
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">Importe del pago: ${formatAmount(amount)}</p>
            </div>

            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-medium">Seleccione el tipo de factura</legend>
              {INVOICE_TYPES.map((type) => (
                <label key={type} className="flex cursor-pointer items-center gap-3 rounded-md border p-3">
                  <input
                    type="radio"
                    name={`payment-voucher-type-${cashMovementId}`}
                    value={type}
                    checked={billType === type}
                    onChange={() => setBillType(type)}
                  />
                  <span>{type}</span>
                </label>
              ))}
            </fieldset>

            <div className="space-y-2">
              <label htmlFor={`payment-voucher-pto-${cashMovementId}`} className="text-sm font-medium">Punto de venta</label>
              <PointOfSaleSelector values={configuredPtoVentas} value={ptoVenta} onChange={setPtoVenta} disabled={configuredPtoVentas.length === 0} />
              {configuredPtoVentas.length === 0 && <p className="text-sm text-destructive">No hay puntos de venta configurados.</p>}
              {ptoVenta && <p className="text-xs text-muted-foreground">Se emitirá en el punto de venta {ptoVenta}.</p>}
            </div>

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={submitting} onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" aria-label="Confirm issue" disabled={!billType || !configuredPtoVentas.includes(Number(ptoVenta)) || submitting} onClick={handleCreate}>
                {submitting ? "Procesando…" : "Confirm invoice"}
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
