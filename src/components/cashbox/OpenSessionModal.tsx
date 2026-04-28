"use client";

import { useState } from "react";
import { openSession } from "@/actions/cashbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export const OpenSessionModal = ({ 
  isOpen, 
  onClose 
}: { 
  isOpen: boolean; 
  onClose: () => void 
}) => {
  const [initialBalance, setInitialBalance] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleOpenSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const amount = parseFloat(initialBalance);
    if (isNaN(amount) || amount < 0) {
      toast.error("Monto inicial inválido");
      setLoading(false);
      return;
    }

    const result = await openSession(amount);
    
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Sesión de caja abierta exitosamente");
      router.refresh();
    }
    
    setLoading(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[425px]">        <DialogHeader>
          <DialogTitle>Apertura de Caja</DialogTitle>
          <DialogDescription>
            Inicie una nueva sesión de caja ingresando el monto inicial en efectivo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleOpenSession} className="space-y-4 pt-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Monto Inicial (Efectivo)</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              required
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
              placeholder="0.00"
              autoFocus
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Abriendo..." : "Abrir Sesión"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
