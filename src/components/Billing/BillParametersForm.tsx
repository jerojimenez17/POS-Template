"use client";
import ClientConditions from "@/models/ClientConditions";
import PaidMethods from "@/models/PaidMethods";
import { BillParametersSchema } from "@/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FormField, FormItem, FormLabel, Form } from "../ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import React, { useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { BillContext } from "@/context/BillContext";
import BillTypes from "@/models/billType";
import { getVoucherNumberAction } from "@/actions/voucher";
import { cn } from "@/lib/utils";
import { Settings2, X, FileText, Receipt } from "lucide-react";

interface BillParametersFormProps {
  ptoVentas?: number[];
  layout?: "compact" | "cards";
}

const BillParametersForm = ({ ptoVentas = [], layout = "compact" }: BillParametersFormProps) => {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [lastVoucherNum, setLastVoucherNum] = React.useState<number | null>(null);
  const [loadingVoucher, setLoadingVoucher] = React.useState(false);
  const { dispatch, BillState, onOrderResetRef } = useContext(BillContext);

  const form = useForm<z.infer<typeof BillParametersSchema>>({
    resolver: zodResolver(BillParametersSchema),
    defaultValues: {
      paidMethod: PaidMethods.EFECTIVO,
      clientCondition: ClientConditions.CONSUMIDOR_FINAL,
      discount: 0,
      twoMethods: false,
      billType: BillTypes.C,
      totalSecondMethod: 0,
      secondPaidMethod: PaidMethods.DEBITO,
      ptoVenta: ptoVentas.length > 0 ? ptoVentas[0] : undefined,
    },
  });

  const watchBillType = form.watch("billType");
  const watchPtoVenta = form.watch("ptoVenta");
  const watchClientCondition = form.watch("clientCondition");
  const watchDiscount = form.watch("discount");
  const watchTwoMethods = form.watch("twoMethods");
  const watchPaidMethod = form.watch("paidMethod");

  useEffect(() => {
    const fetchVoucher = async () => {
      if (!watchPtoVenta) return;
      setLoadingVoucher(true);
      let tipoFactura = 11;
      const billTypeStr = String(watchBillType).toLowerCase();
      if (billTypeStr.includes("factura a")) tipoFactura = 1;
      else if (billTypeStr.includes("factura b")) tipoFactura = 6;
      const res = await getVoucherNumberAction(watchPtoVenta, tipoFactura);
      if (res.success !== undefined) setLastVoucherNum(res.success);
      else setLastVoucherNum(null);
      setLoadingVoucher(false);
    };
    fetchVoucher();
  }, [watchBillType, watchPtoVenta]);

  useEffect(() => {
    onOrderResetRef.current = () => {
      form.reset({
        paidMethod: PaidMethods.EFECTIVO,
        clientCondition: ClientConditions.CONSUMIDOR_FINAL,
        discount: 0,
        twoMethods: false,
        billType: BillTypes.C,
        totalSecondMethod: 0,
        secondPaidMethod: PaidMethods.DEBITO,
        ptoVenta: ptoVentas.length > 0 ? ptoVentas[0] : undefined,
      });
    };
  }, [form, onOrderResetRef]);

  const currentDate = useMemo(() => new Date(), []);
  const billStateRef = useRef(BillState);
  billStateRef.current = BillState;

  const pushToContext = useCallback(() => {
    const values = form.getValues();
    const clientCondition = values.clientCondition;
    const documentNumber = values.documentNumber ?? 0;
    const bs = billStateRef.current;
    dispatch({
      type: "setState",
      payload: {
        ...values,
        id: bs.id || "",
        products: bs.products,
        total: bs.total,
        totalWithDiscount: bs.totalWithDiscount,
        seller: bs.seller,
        date: currentDate,
        typeDocument: clientCondition,
        documentNumber,
        IVACondition: clientCondition,
        clientIvaCondition: clientCondition,
        clientDocumentNumber: String(documentNumber),
        ptoVenta: values.ptoVenta,
      },
    });
  }, [dispatch, currentDate, form]);

  const watchDocumentNumber = form.watch("documentNumber");
  const watchBillTypeField = form.watch("billType");
  const watchTotalSecondMethod = form.watch("totalSecondMethod");
  const watchSecondPaidMethod = form.watch("secondPaidMethod");
  const watchPtoVentaField = form.watch("ptoVenta");

  useEffect(() => {
    const timer = setTimeout(pushToContext, 150);
    return () => clearTimeout(timer);
  }, [watchPaidMethod, watchClientCondition, watchDiscount, watchTwoMethods,
      watchBillTypeField, watchTotalSecondMethod, watchSecondPaidMethod,
      watchPtoVentaField, watchDocumentNumber, pushToContext]);

  // Shared: document number input (appears on non-CF conditions)
  const showDocInput = watchClientCondition !== ClientConditions.CONSUMIDOR_FINAL;

  // Shared: split payment fields
  const showSplit = watchTwoMethods;

  const formContent = (
    <Form {...form}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_auto] gap-4">
          {/* COL 1: Comprobante */}
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <FormField
                control={form.control}
                name="billType"
                render={({ field }) => (
                  <FormItem className="min-w-[140px]">
                    <FormLabel className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tipo</FormLabel>
                    <Select {...field} onValueChange={field.onChange}>
                      <SelectTrigger className="h-8 text-sm rounded-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(BillTypes).map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              {ptoVentas.length > 0 && (
                <FormField
                  control={form.control}
                  name="ptoVenta"
                  render={({ field }) => (
                    <FormItem className="min-w-[90px]">
                      <FormLabel className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Pto.</FormLabel>
                      <Select value={field.value ? String(field.value) : undefined} onValueChange={(v) => field.onChange(Number(v))}>
                        <SelectTrigger className="h-8 text-sm rounded-md">
                          <SelectValue placeholder="-" />
                        </SelectTrigger>
                        <SelectContent>
                          {ptoVentas.map((p) => (
                            <SelectItem key={p} value={String(p)}>{String(p).padStart(3, '0')}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              )}
              {watchPtoVenta && (
                <div className="self-end pb-1.5">
                  <span className="text-[11px] font-mono text-gray-400">
                    {loadingVoucher ? "..." : `${String(watchPtoVenta).padStart(3, '0')}-${String((lastVoucherNum || 0) + 1).padStart(4, '0')}`}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <FormField
                control={form.control}
                name="clientCondition"
                render={({ field }) => (
                  <FormItem className="min-w-[150px]">
                    <FormLabel className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Cond. IVA</FormLabel>
                    <Select {...field} onValueChange={field.onChange}>
                      <SelectTrigger className="h-8 text-sm rounded-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(ClientConditions).map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              {showDocInput && (
                <FormField
                  control={form.control}
                  name="documentNumber"
                  render={({ field }) => (
                    <FormItem className="min-w-[130px]">
                      <FormLabel className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        {watchClientCondition === ClientConditions.CUIT ? "CUIT" : "DNI"}
                      </FormLabel>
                      <Input
                        className="h-8 text-sm rounded-md"
                        type="number"
                        name={field.name}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                        onBlur={field.onBlur}
                        ref={field.ref}
                      />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </div>

          {/* COL 2: Pago */}
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <FormField
                control={form.control}
                name="paidMethod"
                render={({ field }) => (
                  <FormItem className="min-w-[140px]">
                    <FormLabel className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Pago</FormLabel>
                    <Select {...field} onValueChange={field.onChange}>
                      <SelectTrigger className="h-8 text-sm rounded-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(PaidMethods).map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="twoMethods"
                render={({ field }) => (
                  <FormItem className="self-end pb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Checkbox
                        id="twoMethods"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="h-3.5 w-3.5"
                      />
                      <label htmlFor="twoMethods" className="text-[11px] font-medium text-gray-500 dark:text-gray-400 cursor-pointer select-none">
                        Dividir
                      </label>
                    </div>
                  </FormItem>
                )}
              />
            </div>
            {showSplit && (
              <div className="flex items-center gap-3 flex-wrap pl-1 border-l-2 border-gray-200 dark:border-gray-700">
                <FormField
                  control={form.control}
                  name="secondPaidMethod"
                  render={({ field }) => (
                    <FormItem className="min-w-[130px]">
                      <FormLabel className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">2do medio</FormLabel>
                      <Select {...field} onValueChange={field.onChange}>
                        <SelectTrigger className="h-8 text-sm rounded-md">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.values(PaidMethods).map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="totalSecondMethod"
                  render={({ field }) => (
                    <FormItem className="min-w-[100px]">
                      <FormLabel className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Monto</FormLabel>
                      <Input
                        className="h-8 text-sm rounded-md"
                        placeholder="0"
                        {...field}
                        onChange={field.onChange}
                      />
                    </FormItem>
                  )}
                />
              </div>
            )}
          </div>

          {/* COL 3: Descuento (compact) */}
          <div className="space-y-2 self-start">
            <FormField
              control={form.control}
              name="discount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Desc.</FormLabel>
                  <div className="relative min-w-[90px]">
                    <Input
                      className="h-8 text-sm rounded-md pr-7"
                      {...field}
                      value={field.value === 0 ? "" : field.value}
                      placeholder="0"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">%</span>
                  </div>
                </FormItem>
              )}
            />
            {watchDiscount > 0 && (
              <div className="rounded-md bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 px-2.5 py-1.5">
                <span className="text-[11px] font-medium text-orange-700 dark:text-orange-400">
                  -{watchDiscount}%
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Form>
  );

  if (layout === "cards") {
    // ──── CARD LAYOUT (edit page) ────
    return (
      <Form {...form}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* ──── DATOS DEL COMPROBANTE ──── */}
          <section className="bg-card border rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-card-foreground mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Datos del comprobante
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
              <FormField
                control={form.control}
                name="billType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Tipo</FormLabel>
                    <Select {...field} onValueChange={field.onChange}>
                      <SelectTrigger className="h-9 text-sm rounded-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(BillTypes).map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              {ptoVentas.length > 0 && (
                <FormField
                  control={form.control}
                  name="ptoVenta"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Pto. Venta</FormLabel>
                      <Select value={field.value ? String(field.value) : undefined} onValueChange={(v) => field.onChange(Number(v))}>
                        <SelectTrigger className="h-9 text-sm rounded-md">
                          <SelectValue placeholder="-" />
                        </SelectTrigger>
                        <SelectContent>
                          {ptoVentas.map((p) => (
                            <SelectItem key={p} value={String(p)}>{String(p).padStart(3, '0')}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="clientCondition"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Cond. IVA</FormLabel>
                    <Select {...field} onValueChange={field.onChange}>
                      <SelectTrigger className="h-9 text-sm rounded-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(ClientConditions).map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              {showDocInput ? (
                <FormField
                  control={form.control}
                  name="documentNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                        {watchClientCondition === ClientConditions.CUIT ? "CUIT" : "DNI"}
                      </FormLabel>
                      <Input
                        className="h-9 text-sm rounded-md"
                        type="number"
                        name={field.name}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                        onBlur={field.onBlur}
                        ref={field.ref}
                      />
                    </FormItem>
                  )}
                />
              ) : (
                <div className="flex items-end pb-1">
                  <span className="text-xs text-muted-foreground/60 italic">
                    Consumidor Final — no requiere documento
                  </span>
                </div>
              )}
            </div>
            {watchPtoVenta && (
              <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground font-mono">
                Próximo: {String(watchPtoVenta).padStart(3, '0')}-{String((lastVoucherNum || 0) + 1).padStart(4, '0')}
              </div>
            )}
          </section>

          {/* ──── PAGO ──── */}
          <section className="bg-card border rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-card-foreground mb-4 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              Pago
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
                <FormField
                  control={form.control}
                  name="paidMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Medio de pago</FormLabel>
                      <Select {...field} onValueChange={field.onChange}>
                        <SelectTrigger className="h-9 text-sm rounded-md">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.values(PaidMethods).map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <div className="flex items-end pb-1">
                  <FormField
                    control={form.control}
                    name="twoMethods"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center gap-2.5 cursor-pointer select-none">
                          <Checkbox
                            id="twoMethods-edit"
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            className="h-4 w-4"
                          />
                          <label htmlFor="twoMethods-edit" className="text-sm font-medium cursor-pointer">
                            Dividir pago
                          </label>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              {showSplit && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3 pl-5 border-l-2 border-border">
                  <FormField
                    control={form.control}
                    name="secondPaidMethod"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">2do medio</FormLabel>
                        <Select {...field} onValueChange={field.onChange}>
                          <SelectTrigger className="h-9 text-sm rounded-md">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.values(PaidMethods).map((m) => (
                              <SelectItem key={m} value={m}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="totalSecondMethod"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Monto 2do medio</FormLabel>
                        <Input
                          className="h-9 text-sm rounded-md"
                          placeholder="0"
                          {...field}
                          onChange={field.onChange}
                        />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Descuento inline */}
              <div className="pt-3 border-t border-border">
                <FormField
                  control={form.control}
                  name="discount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Descuento</FormLabel>
                      <div className="flex items-center gap-3">
                        <div className="relative w-28">
                          <Input
                            className="h-9 text-sm rounded-md pr-7 text-right"
                            {...field}
                            value={field.value === 0 ? "" : field.value}
                            placeholder="0"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                        </div>
                        {watchDiscount > 0 && (
                          <span className="text-sm text-orange-600 dark:text-orange-400 font-medium">
                            -{watchDiscount}%
                          </span>
                        )}
                        {!watchDiscount && (
                          <span className="text-xs text-muted-foreground/60 italic">Sin descuento</span>
                        )}
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </section>
        </div>
      </Form>
    );
  }

  // ──── COMPACT LAYOUT (default) ────
  return (
    <>
      {/* Desktop: always visible */}
      <div className="hidden md:block bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 md:px-6 py-3">
        <div className="max-w-7xl mx-auto">
          {formContent}
        </div>
      </div>

      {/* Mobile: toggle button */}
      <div className="md:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full",
            mobileOpen
              ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
              : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
          )}
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
          <span>Parámetros de venta</span>
          <div className="ml-auto flex items-center gap-2 text-[11px] text-gray-400">
            <span>{watchBillTypeField}</span>
            <span>·</span>
            <span>{watchPaidMethod}</span>
            {watchDiscount > 0 && (
              <>
                <span>·</span>
                <span>-{watchDiscount}%</span>
              </>
            )}
          </div>
        </button>
        {mobileOpen && (
          <div className="pt-3 pb-1">
            {formContent}
          </div>
        )}
      </div>
    </>
  );
};

export default BillParametersForm;
