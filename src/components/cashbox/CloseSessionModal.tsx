"use client";

import { useState } from "react";
import { closeSession } from "@/actions/cashbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ZReport {
  totalSales: number;
  totalDiscounts: number;
  totalReturns: number;
  netTotal: number;
  orderCount: number;
  returnCount: number;
  paymentMethods: Record<string, number>;
  expectedFinalBalance: number;
  declaredFinalBalance: number;
  difference: number;
}

export const CloseSessionModal = ({
  isOpen,
  onClose,
  onClosingChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  onClosingChange?: (closing: boolean) => void;
}) => {
  const [loading, setLoading] = useState(false);
  const [finalBalance, setFinalBalance] = useState<string>("");
  const [zReport, setZReport] = useState<ZReport | null>(null);
  const router = useRouter();

  const handleCloseSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    onClosingChange?.(true);

    const balance = finalBalance === "" ? undefined : parseFloat(finalBalance);
    const result = await closeSession(balance);

    if (result.error) {
      toast.error(result.error);
      onClosingChange?.(false);
    } else if (result.zReport) {
      setZReport(result.zReport as ZReport);
      toast.success("Sesión cerrada exitosamente");
    }

    setLoading(false);
  };

  const handleDismiss = () => {
    setZReport(null);
    setFinalBalance("");
    onClosingChange?.(false);
    onClose();
    router.refresh();
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
    }).format(amount);

  // Z-Report view
  if (zReport) {
    return (
      <Dialog open={isOpen} onOpenChange={handleDismiss}>
        <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">📊 Cierre de Caja — Informe Z</DialogTitle>
            <DialogDescription>
              Resumen de las operaciones de la sesión
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Sales summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-xs text-muted-foreground">Ventas Totales</p>
                <p className="text-lg font-bold text-green-600">{formatCurrency(zReport.totalSales)}</p>
                <p className="text-xs text-muted-foreground">{zReport.orderCount} operaciones</p>
              </div>
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-xs text-muted-foreground">Devoluciones</p>
                <p className="text-lg font-bold text-red-500">{formatCurrency(zReport.totalReturns)}</p>
                <p className="text-xs text-muted-foreground">{zReport.returnCount} devoluciones</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-xs text-muted-foreground">Descuentos</p>
                <p className="text-lg font-semibold text-orange-500">{formatCurrency(zReport.totalDiscounts)}</p>
              </div>
              <div className="rounded-lg border p-3 space-y-1 bg-slate-50 dark:bg-slate-800">
                <p className="text-xs text-muted-foreground">Neto Total</p>
                <p className="text-lg font-bold">{formatCurrency(zReport.netTotal)}</p>
              </div>
            </div>

            <Separator />

            {/* Payment methods */}
            <div>
              <h4 className="font-semibold mb-2 text-sm">Medios de Pago</h4>
              <div className="space-y-1.5">
                {Object.entries(zReport.paymentMethods).map(([method, total]) => (
                  <div key={method} className="flex justify-between items-center text-sm px-1">
                    <span className="text-muted-foreground">{method}</span>
                    <span className="font-medium">{formatCurrency(total)}</span>
                  </div>
                ))}
                {Object.keys(zReport.paymentMethods).length === 0 && (
                  <p className="text-xs text-muted-foreground italic">Sin movimientos</p>
                )}
              </div>
            </div>

            <Separator />

            {/* Balance comparison */}
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Arqueo de Caja</h4>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Saldo esperado (efectivo)</span>
                <span className="font-medium">{formatCurrency(zReport.expectedFinalBalance)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Saldo declarado</span>
                <span className="font-medium">{formatCurrency(zReport.declaredFinalBalance)}</span>
              </div>
              <div className={`flex justify-between text-sm font-bold ${zReport.difference === 0 ? "text-green-600" : zReport.difference > 0 ? "text-blue-600" : "text-red-600"}`}>
                <span>Diferencia</span>
                <span>
                  {zReport.difference > 0 ? "+" : ""}
                  {formatCurrency(zReport.difference)}
                </span>
              </div>
            </div>

            <Button onClick={handleDismiss} className="w-full mt-2">
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Input form view
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Cierre de Caja</DialogTitle>
          <DialogDescription>
            Confirme los montos finales y cierre la sesión de caja.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCloseSession} className="space-y-4 pt-4">
          <div className="py-4 text-center">
            <p className="text-sm text-muted-foreground">
              ¿Estás seguro de que deseas cerrar la sesión de caja?
            </p>
          </div>

          <div className="space-y-2 px-4">
            <Label htmlFor="finalBalance" className="text-xs text-muted-foreground uppercase font-bold">
              Monto en efectivo (Opcional)
            </Label>
            <Input
              id="finalBalance"
              type="number"
              step="0.01"
              placeholder="Ej: 5000"
              value={finalBalance}
              onChange={(e) => setFinalBalance(e.target.value)}
              className="text-lg py-6"
              autoFocus
            />
            <p className="text-[10px] text-muted-foreground italic">
              Si se deja vacío, se utilizará el saldo calculado por el sistema.
            </p>
          </div>

          <div className="flex gap-2 p-4 pt-0">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={loading} variant="destructive">
              {loading ? "Cerrando..." : "Cerrar Sesión"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
