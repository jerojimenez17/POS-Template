"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calculator, FileText, Receipt, Loader2 } from "lucide-react";
import type BillState from "@/models/BillState";
import type CAE from "@/models/CAE";
import BillTypes from "@/models/billType";
import ClientConditions from "@/models/ClientConditions";
import PaidMethods from "@/models/PaidMethods";
import { createAfipVoucherAction } from "@/actions/afip";
import { toast } from "sonner";
import { parsePlanError } from "@/lib/plan-error";
import { FeatureBlockedModal } from "@/components/ui/feature-blocked-modal";

interface InvoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: BillState;
}

const inputClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring";
const selectClass =
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
  const totalFinal = subtotal - discountAmount;

  const formato = (n: number) =>
    n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ──── Confirm ────
  const handleInvoice = async () => {
    setInvoicing(true);
    try {
      // Merge sale data with modal selections
      const payload: BillState = {
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
      };

      const result = await createAfipVoucherAction(payload);
      if ("error" in result && result.error) {
        const parsed = parsePlanError(result.error);
        if (parsed.isPlanError) {
          setPlanError(parsed);
        } else {
          toast.error(result.error);
        }
      } else if ("success" in result && result.success) {
        toast.success("Factura emitida correctamente");
        onOpenChange(false);
        window.location.reload();
      }
    } catch (error) {
      toast.error("Error al facturar");
      console.error("Invoice error:", error);
    } finally {
      setInvoicing(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-6xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Facturar Venta #{sale.id.slice(-6).toUpperCase()}
            </DialogTitle>
          </DialogHeader>

          <div className="py-4">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              {/* ──── DATOS DEL COMPROBANTE ──── */}
              <section className="lg:col-span-3 bg-card border rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-card-foreground mb-4 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Datos del comprobante
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                      Tipo
                    </Label>
                    <select
                      value={billType}
                      onChange={(e) => setBillType(e.target.value)}
                      className={selectClass}
                    >
                      {Object.values(BillTypes).map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                      Cond. IVA
                    </Label>
                    <select
                      value={ivaCondition}
                      onChange={(e) => setIvaCondition(e.target.value)}
                      className={selectClass}
                    >
                      {Object.values(ClientConditions).map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  {showDocInput ? (
                    <div>
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
                    <div className="flex items-end pb-1">
                      <span className="text-xs text-muted-foreground/60 italic">
                        Consumidor Final — no requiere documento
                      </span>
                    </div>
                  )}
                </div>
              </section>

              {/* ──── CLIENTE (compacto) ──── */}
              <section className="lg:col-span-2 bg-card border rounded-xl p-5 shadow-sm">
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
                    <select
                      value={paidMethod}
                      onChange={(e) => setPaidMethod(e.target.value)}
                      className={selectClass}
                    >
                      {Object.values(PaidMethods).map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
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
                      <select
                        value={secondPaidMethod}
                        onChange={(e) => setSecondPaidMethod(e.target.value)}
                        className={selectClass}
                      >
                        {Object.values(PaidMethods).map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-4 items-center">
                  <div>
                    <span className="text-xs text-muted-foreground block mb-1">Subtotal</span>
                    <span className="text-lg font-semibold font-mono tabular-nums">
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
                          className={`${inputClass} pr-7 text-right`}
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
                  <div className="sm:text-right">
                    <span className="text-xs text-muted-foreground block mb-1">Total final</span>
                    <span className="text-2xl font-bold font-mono tabular-nums text-primary">
                      $ {formato(totalFinal)}
                    </span>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <DialogFooter className="gap-3 pt-4 border-t border-border">
            <DialogClose asChild>
              <Button variant="outline" disabled={invoicing}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              variant="default"
              autoFocus
              onClick={handleInvoice}
              disabled={invoicing}
            >
              {invoicing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {invoicing ? "Facturando..." : "Facturar"}
            </Button>
          </DialogFooter>
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
