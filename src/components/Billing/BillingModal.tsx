"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Select from "./Select";
import BillState from "@/models/BillState";
import { toast } from "sonner";
import postBill from "@/services/AFIPService";
import { updateSale } from "@/services/firebaseService";
import { Input } from "../ui/input";
import { paidMethods } from "@/utils/PaidMethods";
import { Button } from "../ui/button";

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
      
      const resp = await postBill(billToProcess);

      if (resp && resp.afip) {
        // Success
        await updateSale(sale.id, {
          CAE: {
            CAE: resp.afip.CAE,
            vencimiento: resp.afip.CAEFchVto,
            nroComprobante: resp.nroCbte,
            qrData: resp.qrData,
          },
          // Also update these fields in case they changed
          IVACondition: ivaCondition,
          documentNumber: Number(documentNumber),
          paidMethod: paymentMethod,
        });

        toast.success("Factura creada exitosamente");
        onSuccess();
        onOpenChange(false);
      } else {
        toast.error("Error al crear factura: " + (resp || "Respuesta inválida"));
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

  const handleDocumentNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (/^\d*$/.test(val)) {
      setDocumentNumber(val);
    }
  };

  const totalToDisplay = sale.totalWithDiscount || sale.total;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-white text-black">
        <DialogHeader>
          <DialogTitle className="text-pink-400">Facturar Venta</DialogTitle>
          <DialogDescription>
            Genere una Factura C para esta venta existente.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          
          {/* Tipo de Comprobante - Fixed */}
          <div className="grid grid-cols-4 items-center gap-4">
            <label className="text-right text-sm text-gray-500">
              Tipo
            </label>
            <Input
              disabled
              value="Factura C"
              className="col-span-3 border-gray-300"
            />
          </div>

          {/* Condición IVA */}
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="iva" className="text-right text-sm text-gray-500">
              Condición
            </label>
            <div className="col-span-3">
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
          </div>

          {/* Document Number */}
          {ivaCondition !== "Consumidor Final" && (
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="docNumber" className="text-right text-sm text-gray-500">
                {ivaCondition === "CUIT" ? "CUIT" : "DNI"}
              </label>
              <Input
                id="docNumber"
                value={documentNumber}
                onChange={handleDocumentNumberChange}
                maxLength={ivaCondition === "CUIT" ? 11 : 8}
                className="col-span-3 border-gray-300"
              />
            </div>
          )}

          {/* Forma de Pago */}
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="payment" className="text-right text-sm text-gray-500">
              Pago
            </label>
            <div className="col-span-3">
                <Select
                    id="payment"
                    active={true}
                    value={paymentMethod}
                    options={paidMethods.map((pm) => pm.name)}
                    handleChange={(e) => setPaymentMethod(e.target.value)}
                />
            </div>
          </div>

          {/* Totales */}
          <div className="flex justify-end pt-4">
            <div className="text-lg font-bold text-pink-400">
              Total: ${totalToDisplay.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </div>
          </div>

        </div>
        <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancelar
            </Button>
            <Button onClick={handleBilling} disabled={loading} className="bg-pink-400 hover:bg-pink-500 text-white">
                {loading ? "Facturando..." : "Facturar"}
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BillingModal;
