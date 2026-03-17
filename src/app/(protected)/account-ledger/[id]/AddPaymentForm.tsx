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

interface AddPaymentFormProps {
  orderId: string;
  remainingBalance: number;
  businessId: string;
  showForm?: boolean;
}

export default function AddPaymentForm({
  orderId,
  remainingBalance,
  businessId,
  showForm = false,
}: AddPaymentFormProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(showForm);
  const [amount, setAmount] = useState(remainingBalance.toString());
  const [paymentMethod, setPaymentMethod] = useState("Efectivo");
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);

    try {
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        toast.error("Ingrese un monto válido");
        return;
      }

      if (amountNum > remainingBalance) {
        toast.error("El monto no puede exceder el saldo pendiente");
        return;
      }

      const result = await registerPayment({
        orderId,
        amount: amountNum,
        paymentMethod,
        businessId,
      });

      if (result.success) {
        toast.success("Pago registrado correctamente");
        router.refresh();
        setIsOpen(false);
        setAmount(remainingBalance.toString());
      } else {
        const errorMsg = 'error' in result ? result.error : "Error al registrar el pago";
        toast.error(errorMsg || "Error al registrar el pago");
      }
      } catch (error) {
        console.error("Error registering payment:", error);
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
            step="0.01"
            min="0"
            max={remainingBalance}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
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
        <Button type="submit" className="flex-1" disabled={isPending}>
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
