"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Select from "./Select";
import BillState from "@/models/BillState";
import { toast } from "sonner";
import { createAfipVoucherAction } from "@/actions/afip";
import { updateOrderCaeAction } from "@/actions/sales/update";
import { Input } from "../ui/input";
import { paidMethods } from "@/utils/PaidMethods";
import { Button } from "../ui/button";
import { FileText, Receipt, Calculator } from "lucide-react";

interface BillingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: BillState;
  onSuccess: () => void;
}

const BillingModal = ({
  open,
  onOpenChange,
  sale,
  onSuccess,
}: BillingModalProps) => {
  const [loading, setLoading] = useState(false);
  const [ivaCondition, setIvaCondition] = useState("Consumidor Final");
  const [documentNumber, setDocumentNumber] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState("Efectivo");
  const [discount, setDiscount] = useState<number>(0);

  useEffect(() => {
    if (sale) {
      setIvaCondition(sale.IVACondition || "Consumidor Final");
      setDocumentNumber(sale.documentNumber?.toString() || "");
      setPaymentMethod(sale.paidMethod || "Efectivo");
      setDiscount(sale.discount || 0);
    }
  }, [sale, open]);

  const handleBilling = async () => {
    setLoading(true);
    try {
      // Prepare BillState for AFIP
      // Note: We are transforming the current sale data combined with modal inputs
      const billToProcess: BillState = {
        ...sale,
        IVACondition: ivaCondition,
        documentNumber: Number(documentNumber),
        paidMethod: paymentMethod,
        discount: discount,
        // Ensure totals are recalculated if needed or trust the backend/service handles it based on products?
        // postBill sends the whole object. If we change discount, we might need to recalculate totalWithDiscount.
        // For simplicity, we assume generic values for now or recalculate if needed.
        // But changing discount here might be tricky if "Totales" are displayed from `sale` prop.
        // The prompt says "Totales" (display?).
        // If we change params, we should update the object.
      };

      // Recalculate total if discount changed (optional, if allowed)
      // For now, let's assume discount is read-only or we keep it simple.
      // User prompt says "Allow entering... Totales". Usually totals are derived.
      // Maybe just display totals.

      const resp = await createAfipVoucherAction(billToProcess);

      if (resp.success && resp.data.afip) {
        // Success
        const caeResult = await updateOrderCaeAction(sale.id, {
          CAE: {
            CAE: resp.data.afip.CAE,
            vencimiento: resp.data.afip.CAEFchVto,
            nroComprobante: resp.data.nroCbte || resp.data.afip.nroCbte,
            qrData: resp.data.qrData || resp.data.afip.qrData,
          },
          IVACondition: ivaCondition,
          documentNumber: Number(documentNumber),
          paidMethod: paymentMethod,
        });

        if (caeResult.error) {
          toast.error("Error al actualizar CAE: " + caeResult.error);
          return;
        }

        toast.success("Factura creada exitosamente");
        onSuccess();
        onOpenChange(false);
      } else {
        toast.error(
          "Error al crear factura: " + (resp.error || "Respuesta inválida"),
        );
      }
    } catch (error) {
      console.error(error);
      if (error instanceof Error) {
        toast.error("Error al facturar: " + error.message);
      } else {
        toast.error("Error al facturar: Error desconocido");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentNumberChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const val = e.target.value;
    if (/^\d*$/.test(val)) {
      setDocumentNumber(val);
    }
  };

  const totalToDisplay = useMemo(
    () => sale.totalWithDiscount || sale.total,
    [sale.totalWithDiscount, sale.total],
  );

  const inputClass =
    "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Facturar Venta
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-5">
          {/* Datos del comprobante */}
          <section className="bg-card border rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-card-foreground mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Datos del comprobante
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Tipo
                </label>
                <input
                  disabled
                  value="Factura C"
                  className={`${inputClass} opacity-60 cursor-not-allowed`}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Cond. IVA
                </label>
                <Select
                  id="iva"
                  active={true}
                  value={ivaCondition}
                  options={["Consumidor Final", "CUIT", "DNI"]}
                  handleChange={(e) => {
                    setIvaCondition(e.target.value);
                    if (e.target.value === "Consumidor Final") {
                      setDocumentNumber("");
                    }
                  }}
                />
              </div>
              {ivaCondition !== "Consumidor Final" && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                    {ivaCondition === "CUIT" ? "CUIT" : "DNI"}
                  </label>
                  <Input
                    id="docNumber"
                    value={documentNumber}
                    onChange={handleDocumentNumberChange}
                    maxLength={ivaCondition === "CUIT" ? 11 : 8}
                    className="h-9 text-sm rounded-md"
                  />
                </div>
              )}
              {ivaCondition === "Consumidor Final" && (
                <div className="flex items-end pb-1">
                  <span className="text-xs text-muted-foreground/60 italic">
                    Consumidor Final — no requiere documento
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* Pago */}
          <section className="bg-card border rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-card-foreground mb-4 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              Pago
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Medio de pago
                </label>
                <Select
                  id="payment"
                  active={true}
                  value={paymentMethod}
                  options={paidMethods.map((pm) => pm.name)}
                  handleChange={(e) => setPaymentMethod(e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* Resumen */}
          <section className="bg-card border rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-card-foreground mb-4 flex items-center gap-2">
              <Calculator className="h-4 w-4 text-muted-foreground" />
              Total
            </h3>
            <div className="flex justify-end">
              <div className="text-right">
                <span className="text-xs text-muted-foreground block mb-1">Total final</span>
                <span className="text-2xl font-bold font-mono tabular-nums text-primary">
                  $ {totalToDisplay.toLocaleString("es-AR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>
          </section>
        </div>

        <DialogFooter className="gap-3 pt-2 border-t border-border">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleBilling}
            disabled={loading}
            autoFocus
          >
            {loading ? "Facturando..." : "Facturar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BillingModal;
