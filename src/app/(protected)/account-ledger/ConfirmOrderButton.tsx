"use client";

import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { updateOrderStatus } from "@/actions/orders";

export default function ConfirmOrderButton({ orderId }: { orderId: string }) {
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      const result = await updateOrderStatus(orderId, "confirmado");
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Pedido confirmado");
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
      variant="default"
      size="sm"
      className="bg-green-600 hover:bg-green-700"
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
