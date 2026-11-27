"use client";

import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { updateOrderStatus } from "@/actions/orders";

export default function ConfirmOrderButton({
  orderId,
  onConfirmed,
}: {
  orderId: string;
  onConfirmed?: (orderId: string) => void;
}) {
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      const result = await updateOrderStatus(orderId, "confirmado");
      if (result && 'error' in result && result.error) {
        toast.error(result.error as string);
      } else {
        toast.success("Pedido confirmado");
        onConfirmed?.(orderId);
      }
    } catch (error) {
       console.error("Confirmation error:", error);
       toast.error("Error al confirmar pedido");
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
      onClick={handleConfirm}
      disabled={isConfirming}
    >
      {isConfirming ? (
        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
      ) : (
        <CheckCircle className="h-4 w-4 mr-1" />
      )}
      Confirmar
    </Button>
  );
}
