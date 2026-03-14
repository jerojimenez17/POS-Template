"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { XCircle, Loader2 } from "lucide-react";
import { cancelUnpaidOrder } from "@/actions/unpaid-orders";

interface CancelOrderButtonProps {
  orderId: string;
  businessId: string;
  showButton?: boolean;
}

export default function CancelOrderButton({
  orderId,
  businessId,
  showButton = false,
}: CancelOrderButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(showButton);
  const [isPending, setIsPending] = useState(false);

  const handleCancel = async () => {
    setIsPending(true);
    try {
      const result = await cancelUnpaidOrder({ orderId, businessId });
      if (result.success) {
        toast.success("Orden cancelada correctamente");
        router.push("/account-ledger");
      } else {
        const errorMsg = 'error' in result ? result.error : "Error al cancelar la orden";
        toast.error(errorMsg || "Error al cancelar la orden");
      }
    } catch (error) {
      console.error("Error canceling order:", error);
      toast.error("Error al cancelar la orden");
    } finally {
      setIsPending(false);
    }
  };

  if (!showButton && !isOpen) {
    return (
      <Button
        variant="destructive"
        className="w-full"
        onClick={() => setIsOpen(true)}
      >
        <XCircle className="h-4 w-4 mr-2" />
        Cancelar Orden
      </Button>
    );
  }

  return (
    <div className="space-y-3 p-4 border border-red-200 dark:border-red-900 rounded-lg bg-red-50 dark:bg-red-950/30">
      <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
        <XCircle className="h-5 w-5" />
        <span className="font-medium">Cancelar Orden</span>
      </div>
      <p className="text-sm text-muted-foreground">
        ¿Está seguro que desea cancelar esta orden? Se reintegrará el stock de los productos.
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => setIsOpen(false)}
          disabled={isPending}
        >
          No, mantener
        </Button>
        <Button
          variant="destructive"
          className="flex-1"
          onClick={handleCancel}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <XCircle className="h-4 w-4 mr-2" />
          )}
          Sí, cancelar
        </Button>
      </div>
    </div>
  );
}
