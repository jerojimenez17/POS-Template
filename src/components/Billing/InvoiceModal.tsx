"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calculator, FileText, Receipt, Loader2, ArrowRight } from "lucide-react";
import type BillState from "@/models/BillState";
import BillTypes from "@/models/billType";
import ClientConditions from "@/models/ClientConditions";
import PaidMethods from "@/models/PaidMethods";
import { createAfipVoucherAction } from "@/actions/afip";
import { updateOrderCaeAction } from "@/actions/sales/update";
import { toast } from "sonner";
import { parsePlanError } from "@/lib/plan-error";
import { FeatureBlockedModal } from "@/components/ui/feature-blocked-modal";
import { cn } from "@/lib/utils";

interface InvoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: BillState;
}

const inputClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring";

export default function InvoiceModal({ open, onOpenChange, sale }: InvoiceModalProps) {
  const [invoicing, setInvoicing] = useState(false);
  const [planError, setPlanError] = useState<ReturnType<typeof parsePlanError> | null>(null);

  // ──── Form state ────
  const [billType, setBillType] = useState(sale.billType || BillTypes.C);
  const [ivaCondition, setIvaCondition] = useState(
    sale.IVACondition || sale.clientIvaCondition || ClientConditions.CONSUMIDOR_FINAL
  );
  const [documentNumber, setDocumentNumber] = useState(sale.documentNumber || 0);
  const [paidMethod, setPaidMethod] = useState(sale.paidMethod || PaidMethods.EFECTIVO);
  const [twoMethods, setTwoMethods] = useState(sale.twoMethods || false);
  const [secondPaidMethod, setSecondPaidMethod] = useState(
    sale.secondPaidMethod || PaidMethods.DEBITO
  );
  const [totalSecondMethod, setTotalSecondMethod] = useState(
    sale.totalSecondMethod || 0
  );
  const [discount, setDiscount] = useState(sale.discount || 0);

  const showDocInput = ivaCondition !== ClientConditions.CONSUMIDOR_FINAL;

  // ──── Totals ────
  const subtotal = useMemo(
    () => sale.products.reduce((sum, p) => sum + (p.salePrice || 0) * p.amount, 0),
    [sale.products]
  );
  const discountAmount = subtotal * (discount / 100);

  const formato = (n: number) =>
    n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ──── Confirm ────
  const handleInvoice = async () => {
    setInvoicing(true);
    try {
      const totalFinal = subtotal - discountAmount;

      const payload = {
        ...sale,
        billType,
        IVACondition: ivaCondition,
        typeDocument: ivaCondition,
        documentNumber,
        paidMethod,
        twoMethods,
        secondPaidMethod: twoMethods ? secondPaidMethod : undefined,
        totalSecondMethod: twoMethods ? totalSecondMethod : undefined,
        discount,
        totalWithDiscount: totalFinal,
        clientIvaCondition: ivaCondition,
        clientDocumentNumber: String(documentNumber),
      } as BillState;

      const result = await createAfipVoucherAction(payload);
      if ("error" in result && result.error) {
        const parsed = parsePlanError(result.error);
        if (parsed.isPlanError) {
          setPlanError(parsed);
        } else {
          toast.error(result.error);
        }
      } else if ("success" in result && result.success && result.data?.afip) {
        // Persist CAE + form changes to the order
        const afipData = result.data.afip;
        const caeResult = await updateOrderCaeAction(sale.id, {
          CAE: {
            CAE: afipData.CAE,
            vencimiento: afipData.CAEFchVto,
            nroComprobante: result.data.nroCbte || afipData.nroCbte,
            qrData: result.data.qrData || afipData.qrData,
          },
          IVACondition: ivaCondition,
          documentNumber,
          paidMethod,
          twoMethods,
          secondPaidMethod: twoMethods ? secondPaidMethod : null,
          totalSecondMethod: twoMethods ? totalSecondMethod : null,
          discount,
          billType,
        });

        if (caeResult.error) {
          toast.error("CAE creado pero no se pudo actualizar la venta: " + caeResult.error);
          return;
        }

        toast.success("Factura emitida correctamente");
        onOpenChange(false);
        window.location.reload();
      } else {
        toast.error("Error inesperado al procesar la facturación");
        console.error("Unhandled invoice result:", result);
      }
    } catch (error) {
        const message = error instanceof Error ? error.message : "Error desconocido";
        toast.error("Error al facturar: " + message);
        console.error("Invoice error:", error);
    } finally {
      setInvoicing(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-6xl max-h-[95vh] overflow-y-auto gap-0 p-0">
          {/* ──── HEADER ──── */}
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle className="text-xl flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Facturar Venta #{sale.id.slice(-6).toUpperCase()}
            </DialogTitle>
          </DialogHeader>

          {/* ──── BODY ──── */}
          <div className="px-6 py-5">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

              {/* ──── DATOS DEL COMPROBANTE ──── */}
              <section className="lg:col-span-3 bg-card border rounded-xl p-5 shadow-sm self-start">
                <h3 className="text-sm font-semibold text-card-foreground mb-4 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Datos del comprobante
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                      Tipo
                    </Label>
                    <Select value={billType} onValueChange={setBillType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(BillTypes).map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                      Cond. IVA
                    </Label>
                    <Select value={ivaCondition} onValueChange={setIvaCondition}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(ClientConditions).map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {showDocInput ? (
                    <div className="sm:col-span-2">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                        {ivaCondition === ClientConditions.CUIT ? "CUIT" : "DNI"}
                      </Label>
                      <input
                        type="number"
                        value={documentNumber || ""}
                        onChange={(e) => setDocumentNumber(Number(e.target.value) || 0)}
                        className={inputClass}
                        placeholder="Ingrese número"
                      />
                    </div>
                  ) : (
                    <div className="sm:col-span-2 flex items-end pb-1">
                      <span className="text-xs text-muted-foreground/60 italic">
                        Consumidor Final — no requiere documento
                      </span>
                    </div>
                  )}
                </div>

                {/* ──── FACTURAR BUTTON ──── */}
                <Button
                  size="lg"
                  onClick={handleInvoice}
                  disabled={invoicing}
                  className="w-full mt-5 h-11 text-base font-semibold gap-2 shadow-sm
                    bg-gradient-to-r from-blue-600 to-blue-500
                    hover:from-blue-700 hover:to-blue-600
                    active:scale-[0.98] transition-all duration-150"
                >
                  {invoicing ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Facturando...
                    </>
                  ) : (
                    <>
                      Facturar
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </section>

              {/* ──── CLIENTE (compacto) ──── */}
              <section className="lg:col-span-2 bg-card border rounded-xl p-5 shadow-sm self-start">
                <h3 className="text-sm font-semibold text-card-foreground mb-4 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Cliente
                </h3>
                <div className="text-sm space-y-2">
                  <div>
                    <span className="text-xs text-muted-foreground block">Nombre</span>
                    <span className="font-medium">{sale.client || "Consumidor Final"}</span>
                  </div>
                  {sale.clientDocumentNumber && (
                    <div>
                      <span className="text-xs text-muted-foreground block">Documento</span>
                      <span className="font-medium font-mono">{sale.clientDocumentNumber}</span>
                    </div>
                  )}
                  {sale.clientIvaCondition && sale.clientIvaCondition !== "Consumidor Final" && (
                    <div>
                      <span className="text-xs text-muted-foreground block">Cond. IVA</span>
                      <span className="font-medium">{sale.clientIvaCondition}</span>
                    </div>
                  )}
                </div>
              </section>

              {/* ──── PAGO ──── */}
              <section className="lg:col-span-5 bg-card border rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-card-foreground mb-4 flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  Pago
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                      Medio de pago
                    </Label>
                    <Select value={paidMethod} onValueChange={setPaidMethod}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(PaidMethods).map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <Checkbox
                        checked={twoMethods}
                        onCheckedChange={(v) => setTwoMethods(!!v)}
                        className="h-4 w-4"
                      />
                      <span className="text-sm font-medium">Dividir pago</span>
                    </label>
                  </div>
                </div>
                {twoMethods && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3 pl-5 border-l-2 border-border">
                    <div>
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                        2do medio
                      </Label>
                      <Select value={secondPaidMethod} onValueChange={setSecondPaidMethod}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.values(PaidMethods).map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                        Monto 2do medio
                      </Label>
                      <input
                        type="number"
                        value={totalSecondMethod || ""}
                        onChange={(e) => setTotalSecondMethod(Number(e.target.value) || 0)}
                        className={inputClass}
                        placeholder="0"
                      />
                    </div>
                  </div>
                )}
              </section>

              {/* ──── RESUMEN ──── */}
              <section className="lg:col-span-5 bg-card border rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-card-foreground mb-4 flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                  Resumen
                </h3>
                <div className="flex flex-wrap items-end gap-x-12 gap-y-4">
                  <div>
                    <span className="text-xs text-muted-foreground block mb-1">Subtotal</span>
                    <span className="text-2xl font-bold font-mono tabular-nums">
                      $ {formato(subtotal)}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block mb-1">Descuento</span>
                    <div className="flex items-center gap-3">
                      <div className="relative w-28">
                        <input
                          type="number"
                          value={discount || ""}
                          onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                          className={cn(inputClass, "pr-7 text-right")}
                          placeholder="0"
                          min={0}
                          max={100}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                          %
                        </span>
                      </div>
                      {discount > 0 && (
                        <span className="text-sm text-orange-600 dark:text-orange-400 font-medium whitespace-nowrap">
                          - $ {formato(discountAmount)}
                        </span>
                      )}
                      {!discount && (
                        <span className="text-xs text-muted-foreground/60 italic">Sin descuento</span>
                      )}
                    </div>
                  </div>
                </div>
              </section>

            </div>
          </div>

          {/* ──── FOOTER (solo cancelar) ──── */}
          <div className="px-6 py-4 border-t border-border flex justify-end">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={invoicing}
              className="text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <FeatureBlockedModal
        open={!!planError}
        onOpenChange={(open) => { if (!open) setPlanError(null); }}
        variant={planError?.variant ?? "feature"}
        feature={planError?.feature}
        resource={planError?.resource}
        limitValue={planError?.limitValue}
      />
    </>
  );
}
