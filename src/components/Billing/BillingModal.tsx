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
import { createAfipVoucherAction } from "@/actions/afip";
import { updateOrderCaeAction } from "@/actions/sales/update";
import { Input } from "../ui/input";
import { paidMethods } from "@/utils/PaidMethods";
import { Button } from "../ui/button";
import { getDefaultBillType } from "@/utils/billing";
import { getBusinessBillingInfoAction } from "@/actions/business";
import { formatAfipPointSaleErrorForUser, sanitizeAfipText } from "@/services/afip/point-sale-validation";
import { isValidCae } from "@/services/afip/voucher-response";

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
  const [businessCondicionIva, setBusinessCondicionIva] = useState<string | null>(null);

  useEffect(() => {
    getBusinessBillingInfoAction()
      .then((info) => {
        setBusinessCondicionIva(info?.condicionIva ?? null);
      })
      .catch(() => {
        setBusinessCondicionIva(null);
      });
  }, []);

  const defaultBillType = getDefaultBillType(businessCondicionIva);
  // Billing an existing sale uses the business billing default. The sale's
  // historical C value must not override a Responsable Inscripto default.
  const effectiveBillType = defaultBillType;

  useEffect(() => {
    if (sale) {
      const timeoutId = window.setTimeout(() => {
        setIvaCondition(sale.IVACondition || "Consumidor Final");
        setDocumentNumber(sale.documentNumber?.toString() || "");
        setPaymentMethod(sale.paidMethod || "Efectivo");
        setDiscount(sale.discount || 0);
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }
  }, [sale, open]);

  const handleBilling = async () => {
    setLoading(true);
    try {
      // Prepare BillState for AFIP
      // Note: We are transforming the current sale data combined with modal inputs
      const billToProcess: BillState = {
        ...sale,
        billType: effectiveBillType,
        IVACondition: ivaCondition,
        documentNumber: Number(documentNumber),
        paidMethod: paymentMethod,
        discount: discount,
      };

      // Recalculate total if discount changed (optional, if allowed)
      // For now, let's assume discount is read-only or we keep it simple.
      // User prompt says "Allow entering... Totales". Usually totals are derived.
      // Maybe just display totals.

      const resp = await createAfipVoucherAction(billToProcess);

      if ("error" in resp) {
        toast.error(typeof resp.error === "string" ? resp.error : formatAfipPointSaleErrorForUser(resp.error));
        return;
      }
      if (resp.success && isValidCae(resp.data.cae)) {
        // Success
        const caeResult = await updateOrderCaeAction(sale.id, {
          CAE: {
             CAE: resp.data.cae,
             vencimiento: resp.data.vencimiento,
             nroComprobante: resp.data.nroComprobante,
             qrData: resp.data.qrData,
             ptoVenta: resp.data.ptoVenta ?? sale.ptoVenta,
          },
          IVACondition: ivaCondition,
          documentNumber: Number(documentNumber),
          paidMethod: paymentMethod,
          billType: billToProcess.billType,
        });

        if (caeResult.error) {
          toast.error("Error al actualizar CAE: " + caeResult.error);
          return;
        }

        toast.success("Factura creada exitosamente");
        onSuccess();
        onOpenChange(false);
      } else {
        toast.error("Error al crear factura: La respuesta no contiene un CAE válido");
      }
    } catch (error) {
      const safeMessage = error instanceof Error ? sanitizeAfipText(error.message) : "unknown";
      console.error("[createVoucher] client failure", { errorType: typeof error, message: safeMessage });
      if (error instanceof Error) {
        toast.error("Error al facturar: " + safeMessage);
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

  const totalToDisplay = sale.totalWithDiscount || sale.total;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-106.25 bg-white text-black">
        <DialogHeader>
          <DialogTitle className="text-pink-400">Facturar Venta</DialogTitle>
          <DialogDescription>
             Genere una {effectiveBillType} para esta venta existente.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Tipo de Comprobante - Fixed */}
          <div className="grid grid-cols-4 items-center gap-4">
            <label className="text-right text-sm text-gray-500">Tipo</label>
            <Input
              disabled
               value={effectiveBillType}
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
              <label
                htmlFor="docNumber"
                className="text-right text-sm text-gray-500"
              >
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
            <label
              htmlFor="payment"
              className="text-right text-sm text-gray-500"
            >
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
              Total: $
              {totalToDisplay.toLocaleString("es-AR", {
                minimumFractionDigits: 2,
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
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
            className="bg-pink-400 hover:bg-pink-500 text-white"
          >
            {loading ? "Facturando..." : "Facturar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BillingModal;
