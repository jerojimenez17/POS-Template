"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreditCard, Loader2 } from "lucide-react";
import { registerPayment } from "@/actions/unpaid-orders";
import { PointOfSaleSelector } from "@/components/account-ledger/PointOfSaleSelector";
import { InvoiceTypeSelector } from "@/components/account-ledger/InvoiceTypeSelector";
import { toPositiveWholePesos, toWholePesos } from "@/lib/money";

interface AddPaymentFormProps {
  orderId: string;
  remainingBalance: number;
  businessId: string;
  configuredPtoVentas?: number[];
  showForm?: boolean;
}

export default function AddPaymentForm({
  orderId,
  remainingBalance,
  businessId,
  configuredPtoVentas = [],
  showForm = false,
}: AddPaymentFormProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(showForm);
  const [amount, setAmount] = useState(String(remainingBalance));
  const [paymentMethod, setPaymentMethod] = useState("Efectivo");
  const [billType, setBillType] = useState("");
  const [ptoVenta, setPtoVenta] = useState(configuredPtoVentas[0]?.toString() ?? "");
  const [isPending, setIsPending] = useState(false);
  const isRemito = billType === "Remito";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);

    try {
      const proposedAmount = Number(amount);
      const amountNum = toPositiveWholePesos(proposedAmount);
      if (amount.trim() === "" || amountNum === null) {
        toast.error("Ingrese un monto válido");
        return;
      }

      if (amountNum > remainingBalance) {
        toast.error("El monto no puede exceder el saldo pendiente");
        return;
      }
      if (!["Factura A", "Factura B", "Factura C", "Remito"].includes(billType)) {
        toast.error("Seleccione Factura A, Factura B o Factura C");
        return;
      }
      const selectedPtoVenta = Number(ptoVenta);
      if (!isRemito && (!Number.isSafeInteger(selectedPtoVenta) || selectedPtoVenta <= 0 || !configuredPtoVentas.includes(selectedPtoVenta))) {
        toast.error("Seleccione un punto de venta configurado");
        return;
      }

      const result = await registerPayment({
        orderId,
        amount: amountNum,
        paymentMethod,
        businessId,
        billType: billType as "Factura A" | "Factura B" | "Factura C" | "Remito",
        ...(!isRemito ? { ptoVenta: selectedPtoVenta } : {}),
      });

      if (result.success) {
        const outcome = typeof result.data === "object" && result.data !== null
          ? result.data as { voucherStatus?: string }
          : {};
        if (outcome.voucherStatus === "NOT_REQUIRED") {
          toast.success("Pago registrado como Remito, sin emisión AFIP");
        } else if (outcome.voucherStatus === "AUTHORIZED") {
          toast.success("Pago registrado y factura autorizada");
        } else if (outcome.voucherStatus === "UNKNOWN") {
          toast.warning("Pago registrado; verifique la emisión de la factura antes de reintentar");
        } else {
          toast.warning("Pago registrado; la factura no se emitió. Puede recuperarla desde el historial de pagos.");
        }
        router.refresh();
        setIsOpen(false);
        setAmount(String(remainingBalance));
      } else {
        toast.error("No se pudo registrar el pago. Intente nuevamente.");
      }
      } catch {
        toast.error("Error al registrar el pago");
      } finally {
      setIsPending(false);
    }
  };

  if (!showForm && !isOpen) {
    return (
      <Button className="w-full" onClick={() => setIsOpen(true)}>
        <CreditCard className="h-4 w-4 mr-2" />
        Registrar Pago
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2">
        <CreditCard className="h-5 w-5" />
        <span className="font-medium">Registrar Pago</span>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-sm text-muted-foreground">Monto</label>
          <Input
            type="number"
            step="any"
            min="1"
            max={String(remainingBalance)}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={() => {
              const rounded = toWholePesos(Number(amount));
              if (amount.trim() !== "" && rounded !== null) setAmount(String(rounded));
            }}
            placeholder="Monto del pago"
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-sm text-muted-foreground">Método de Pago</label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Seleccionar método" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Efectivo">Efectivo</SelectItem>
              <SelectItem value="Débito">Tarjeta de Débito</SelectItem>
              <SelectItem value="Crédito">Tarjeta de Crédito</SelectItem>
              <SelectItem value="Transferencia">Transferencia</SelectItem>
              <SelectItem value="MercadoPago">Mercado Pago</SelectItem>
              <SelectItem value="Cuenta Corriente">Cuenta Corriente</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm text-muted-foreground">Tipo de factura</label>
          <InvoiceTypeSelector value={billType} onChange={setBillType} />
        </div>

        {!isRemito && <div>
          <label className="text-sm text-muted-foreground" htmlFor="payment-pto-venta">Punto de venta</label>
          <PointOfSaleSelector id="payment-pto-venta" values={configuredPtoVentas} value={ptoVenta} onChange={setPtoVenta} disabled={configuredPtoVentas.length === 0} />
          {configuredPtoVentas.length === 0 && <p className="mt-1 text-sm text-destructive">No hay puntos de venta configurados.</p>}
        </div>}

        <p className="rounded-md bg-muted p-3 text-sm" aria-live="polite">
          Se registrará ${(() => {
            const rounded = toWholePesos(Number(amount));
            return rounded === null ? "—" : rounded.toLocaleString("es-AR", { maximumFractionDigits: 0 });
          })()}
          {isRemito
            ? " como Remito (sin emisión AFIP)."
            : billType
              ? ` como ${billType}${ptoVenta ? ` en el punto de venta ${ptoVenta}` : "; seleccione un punto de venta"}.`
              : "; seleccione el tipo de factura"}
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => setIsOpen(false)}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" className="flex-1" disabled={isPending || (!isRemito && configuredPtoVentas.length === 0)}>
          {isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <CreditCard className="h-4 w-4 mr-2" />
          )}
          Confirmar
        </Button>
      </div>
    </form>
  );
}
