"use client";

import React, { useEffect, useState, useMemo } from "react";
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
import ClientConditions from "@/models/ClientConditions";
import { toast } from "sonner";
import { createAfipVoucherAction } from "@/actions/afip";
import { updateOrderCaeAction } from "@/actions/sales/update";
import { Input } from "../ui/input";
import { paidMethods } from "@/utils/PaidMethods";
import { Button } from "../ui/button";
import { FileText, Receipt, Calculator } from "lucide-react";
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
  const [ivaCondition, setIvaCondition] = useState<string>(ClientConditions.CONSUMIDOR_FINAL);
  const [documentType, setDocumentType] = useState<string>("");
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
        setIvaCondition(sale.IVACondition || ClientConditions.CONSUMIDOR_FINAL);
        setDocumentType(sale.typeDocument || "");
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
      const docType = documentType || (ivaCondition !== ClientConditions.CONSUMIDOR_FINAL ? "DNI" : "");
      const billToProcess: BillState = {
        ...sale,
        billType: effectiveBillType,
        IVACondition: ivaCondition,
        typeDocument: docType,
        documentNumber: documentNumber ? Number(documentNumber) : 0,
        clientDocumentType: docType ? docType as "CUIT" | "DNI" : undefined,
        clientDocumentNumber: documentNumber,
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
          documentType: docType as "CUIT" | "DNI" | "",
          documentNumber,
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
        toast.error("Error al crear factura: La respuesta no contiene un CAE v├ílido");
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
          <DialogDescription>
            Genere una {effectiveBillType} para esta venta existente.
          </DialogDescription>
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
                  value={effectiveBillType}
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
                  options={Object.values(ClientConditions)}
                  handleChange={(e) => {
                    setIvaCondition(e.target.value);
                    if (e.target.value === ClientConditions.CONSUMIDOR_FINAL) {
                      setDocumentNumber("");
                      setDocumentType("");
                    }
                  }}
                />
              </div>
              {ivaCondition !== ClientConditions.CONSUMIDOR_FINAL && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                      Tipo Doc.
                    </label>
                    <Select
                      id="docType"
                      active={true}
                      value={documentType}
                      options={["DNI", "CUIT"]}
                      handleChange={(e) => setDocumentType(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                      {documentType === "CUIT" ? "CUIT" : "DNI"}
                    </label>
                    <Input
                      id="docNumber"
                      value={documentNumber}
                      onChange={handleDocumentNumberChange}
                      maxLength={documentType === "CUIT" ? 11 : 8}
                      className="h-9 text-sm rounded-md"
                    />
                  </div>
                </>
              )}
              {ivaCondition === ClientConditions.CONSUMIDOR_FINAL && (
                <div className="flex items-end pb-1">
                  <span className="text-xs text-muted-foreground/60 italic">
                    Consumidor Final ÔÇö no requiere documento
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
