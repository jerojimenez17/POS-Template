"use client";

import { useState, useContext, useMemo } from "react";
import { BillContext } from "@/context/BillContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";
import { FileText, Receipt, Calculator } from "lucide-react";


import BillTypes from "@/models/billType";
import ClientConditions from "@/models/ClientConditions";
import PaidMethods from "@/models/PaidMethods";
import Product from "@/models/Product";

interface CheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "factura" | "remito";
  ptoVentas?: number[];
  onConfirm: () => void;
}

export default function CheckoutModal({
  open,
  onOpenChange,
  type,
  ptoVentas = [],
  onConfirm,
}: CheckoutModalProps) {
  const { BillState, dispatch } = useContext(BillContext);

  // --- Parámetros (local state, dispatches on confirm) ---
  const [billType, setBillType] = useState(BillState.billType || BillTypes.C);
  const [ptoVenta, setPtoVenta] = useState<number | undefined>(
    BillState.ptoVenta || (ptoVentas.length > 0 ? ptoVentas[0] : undefined)
  );
  const [ivaCondition, setIvaCondition] = useState(
    BillState.IVACondition || ClientConditions.CONSUMIDOR_FINAL
  );
  const [documentNumber, setDocumentNumber] = useState(
    BillState.documentNumber || 0
  );
  const [paidMethod, setPaidMethod] = useState(
    BillState.paidMethod || PaidMethods.EFECTIVO
  );
  const [twoMethods, setTwoMethods] = useState(BillState.twoMethods || false);
  const [secondPaidMethod, setSecondPaidMethod] = useState(
    BillState.secondPaidMethod || PaidMethods.DEBITO
  );
  const [totalSecondMethod, setTotalSecondMethod] = useState(
    BillState.totalSecondMethod || 0
  );
  const [discount, setDiscount] = useState(BillState.discount || 0);

  // --- Derived totals ---
  const subtotal = useMemo(
    () =>
      BillState.products.reduce(
        (sum: number, p: Product) =>
          sum + (p.salePrice || p.price || 0) * p.amount,
        0
      ),
    [BillState.products]
  );
  const discountAmount = subtotal * discount / 100;
  const totalFinal = subtotal - discountAmount;

  const handleConfirm = () => {
    const current = BillState;
    dispatch({
      type: "setState",
      payload: {
        ...current,
        billType: billType || BillTypes.C,
        IVACondition: ivaCondition,
        typeDocument: ivaCondition,
        documentNumber,
        paidMethod,
        twoMethods,
        secondPaidMethod: twoMethods ? secondPaidMethod : undefined,
        totalSecondMethod: twoMethods ? totalSecondMethod : undefined,
        discount,
        ptoVenta,
        clientIvaCondition: ivaCondition,
        clientDocumentNumber: String(documentNumber),
        totalWithDiscount: totalFinal,
      },
    });

    onConfirm();
  };

  const showDocInput =
    ivaCondition !== ClientConditions.CONSUMIDOR_FINAL;

  // Shared control styles
  const selectClass =
    "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring";
  const inputClass =
    "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring";

  const formato = (n: number) =>
    n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-6xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              {type === "factura" ? (
                <FileText className="h-5 w-5 text-primary" />
              ) : (
                <Receipt className="h-5 w-5 text-muted-foreground" />
              )}
              <span>{type === "factura" ? "Confirmar Factura" : "Confirmar Remito"}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="py-4">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              {/* ──── DATOS DEL COMPROBANTE ──── */}
              <section className="lg:col-span-5 bg-card border rounded-xl p-5 shadow-sm">
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
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>

                    {ptoVentas.length > 0 && (
                      <div>
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                          Pto. Venta
                        </Label>
                        <select
                          value={ptoVenta ?? ""}
                          onChange={(e) =>
                            setPtoVenta(e.target.value ? Number(e.target.value) : undefined)
                          }
                          className={selectClass}
                        >
                          {ptoVentas.map((p) => (
                            <option key={p} value={p}>
                              {String(p).padStart(3, "0")}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

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
                          <option key={c} value={c}>
                            {c}
                          </option>
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
                          onChange={(e) =>
                            setDocumentNumber(Number(e.target.value) || 0)
                          }
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
                          <option key={m} value={m}>
                            {m}
                          </option>
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
                            <option key={m} value={m}>
                              {m}
                            </option>
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
                          onChange={(e) =>
                            setTotalSecondMethod(Number(e.target.value) || 0)
                          }
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
              <Button variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <DialogClose asChild>
              <Button
                variant="default"
                autoFocus
                onClick={handleConfirm}
              >
                {type === "factura" ? "Facturar" : "Confirmar Remito"}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}
