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
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BillContext } from "@/context/BillContext";
import BillTypes from "@/models/billType";
import { getVoucherNumberAction } from "@/actions/voucher";
import { cn } from "@/lib/utils";
import { Settings2, X, FileText, Receipt } from "lucide-react";
import { getDefaultBillType } from "@/utils/billing";
import { getBusinessBillingInfoAction } from "@/actions/business";
import { formatAfipPointSaleErrorForUser, type AfipPointSaleError } from "@/services/afip/point-sale-validation";

/** AFIP comprobante codes: A=1, B=6, C=11 (Jero f485810/5cefac7). */
const getVoucherTypeCode = (billType: string): 1 | 6 | 11 => {
  if (billType === BillTypes.A) return 1;
  if (billType === BillTypes.B) return 6;
  return 11;
};

interface BillParametersFormProps {
  ptoVentas?: number[];
  layout?: "compact" | "cards";
}

const BillParametersForm = ({ ptoVentas = [], layout = "compact" }: BillParametersFormProps) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lastVoucherNum, setLastVoucherNum] = useState<number | null>(null);
  const [loadingVoucher, setLoadingVoucher] = useState(false);
  const [voucherError, setVoucherError] = useState<AfipPointSaleError | string | null>(null);
  const requestSequence = useRef(0);
  const { dispatch, BillState, onOrderResetRef, billTypeRef, initialBillType } = useContext(BillContext);

  // Jero (5cefac7): default comprobante type derives from the business IVA
  // condition (Factura B for Responsable Inscripto) provided via context;
  // getDefaultBillType() falls back to Factura C.
  const defaultBillType = initialBillType ?? getDefaultBillType();

  const form = useForm<z.infer<typeof BillParametersSchema>>({
    resolver: zodResolver(BillParametersSchema),
    defaultValues: {
      paidMethod: PaidMethods.EFECTIVO,
      clientCondition: ClientConditions.CONSUMIDOR_FINAL,
      discount: 0,
      twoMethods: false,
      billType: defaultBillType,
      totalSecondMethod: 0,
      secondPaidMethod: PaidMethods.DEBITO,
      ptoVenta: ptoVentas.length > 0 ? ptoVentas[0] : undefined,
    },
  });

  const watchBillType = form.watch("billType");
  const watchPtoVenta = form.watch("ptoVenta");
  const watchClientCondition = form.watch("clientCondition");
  const watchTwoMethods = form.watch("twoMethods");
  const watchPaidMethod = form.watch("paidMethod");

  // Jero (5cefac7): standalone path fallback — when no default was supplied
  // server-side/context, resolve the business IVA condition in the browser and
  // correct the comprobante type once.
  useEffect(() => {
    if (initialBillType !== undefined) return;

    let cancelled = false;
    void Promise.resolve(getBusinessBillingInfoAction())
      .then((info) => {
        if (cancelled) return;
        const nextBillType = getDefaultBillType(info?.condicionIva);
        form.setValue("billType", nextBillType);
        dispatch({ type: "billType", payload: nextBillType });
        if (billTypeRef) billTypeRef.current = nextBillType;
      })
      .catch(() => {
        // getDefaultBillType() already provides the required Factura C fallback.
      });

    return () => {
      cancelled = true;
    };
  }, [initialBillType, form, dispatch, billTypeRef]);

  // Keep billTypeRef (consumed by the checkout snapshot sent to AFIP) always
  // mirroring the authoritative form value.
  useEffect(() => {
    if (billTypeRef) billTypeRef.current = watchBillType;
  }, [billTypeRef, watchBillType]);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    const fetchVoucher = async () => {
      if (!watchPtoVenta) return;
      setLoadingVoucher(true);
      const tipoFactura = getVoucherTypeCode(watchBillType);
      const res = await getVoucherNumberAction(watchPtoVenta, tipoFactura);
      // Ignore stale responses after rapid ptoVenta/billType changes (Jero).
      if (requestId !== requestSequence.current) return;
      if (res.success !== undefined) {
        setLastVoucherNum(res.success);
        setVoucherError(null);
      } else {
        setLastVoucherNum(null);
        setVoucherError(res.errorDetails ?? res.error ?? "No se pudo obtener la numeración");
      }
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
        // Jero fix: reset to the business default comprobante type, not a
        // hardcoded Factura C.
        billType: defaultBillType,
        totalSecondMethod: 0,
        secondPaidMethod: PaidMethods.DEBITO,
        ptoVenta: ptoVentas.length > 0 ? ptoVentas[0] : undefined,
      });
      dispatch({ type: "billType", payload: defaultBillType });
      if (billTypeRef) billTypeRef.current = defaultBillType;
    };
  }, [form, onOrderResetRef, defaultBillType, dispatch, billTypeRef, ptoVentas]);

  // Sync form from BillContext when in cards layout (edit mode)
  const syncKey = `${BillState.IVACondition}-${BillState.documentNumber}-${BillState.paidMethod}`;
  useEffect(() => {
    if (layout === "cards" && BillState.IVACondition) {
      form.reset({
        paidMethod: BillState.paidMethod || PaidMethods.EFECTIVO,
        clientCondition: BillState.IVACondition || ClientConditions.CONSUMIDOR_FINAL,
        discount: BillState.discount || 0,
        twoMethods: BillState.twoMethods || false,
        billType: BillState.billType || BillTypes.C,
        totalSecondMethod: BillState.totalSecondMethod || 0,
        secondPaidMethod: BillState.secondPaidMethod || PaidMethods.DEBITO,
        ptoVenta: BillState.ptoVenta || (ptoVentas.length > 0 ? ptoVentas[0] : undefined),
        documentNumber: BillState.documentNumber || 0,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncKey, layout, form]);

  const currentDate = useMemo(() => new Date(), []);
  const billStateRef = useRef(BillState);
  billStateRef.current = BillState;

  // Jero (f485810): surface AFIP/ARCA voucher-number failures to the user.
  const voucherErrorMessage = typeof voucherError === "string"
    ? voucherError
    : voucherError
      ? formatAfipPointSaleErrorForUser(voucherError)
      : null;
  const structuredVoucherError = voucherError && typeof voucherError !== "string" ? voucherError : null;

  const pushToContext = useCallback(() => {
    const values = form.getValues();
    const clientCondition = values.clientCondition;
    const documentNumber = values.documentNumber ?? 0;
    const bs = billStateRef.current;
    dispatch({
      type: "setState",
      payload: {
        ...values,
        // Discount is owned by DiscountControl in the totals section — this
        // form must never clobber it (Jero bca1230/0c30043).
        discount: bs.discount ?? 0,
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
  }, [watchPaidMethod, watchClientCondition, watchTwoMethods,
      watchBillTypeField, watchTotalSecondMethod, watchSecondPaidMethod,
      watchPtoVentaField, watchDocumentNumber, pushToContext]);

  // Shared: document number input (appears on non-CF conditions)
  const showDocInput = watchClientCondition !== ClientConditions.CONSUMIDOR_FINAL;

  // Shared: split payment fields
  const showSplit = watchTwoMethods;

  const voucherErrorAlert = voucherErrorMessage ? (
    <div role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
      <p className="font-semibold">No se pudo obtener la numeración de AFIP/ARCA</p>
      <p className="mt-1">{voucherErrorMessage}</p>
      {structuredVoucherError?.code === "11002" && (
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>Verifique que el punto esté habilitado para WSFE/WSFEv1 en ARCA.</li>
          <li>Confirme el CUIT y el ambiente del certificado.</li>
          <li>Seleccione un punto habilitado o revise la configuración e intente nuevamente.</li>
        </ol>
      )}
    </div>
  ) : null;

  const formContent = (
    <Form {...form}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* COL 1: Comprobante */}
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <FormField
                control={form.control}
                name="billType"
                render={({ field }) => (
                  <FormItem className="min-w-[140px]">
                    <FormLabel className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tipo</FormLabel>
                    <Select {...field} onValueChange={(value) => {
                      field.onChange(value);
                      // Immediate context sync so AFIP calls use the chosen type
                      dispatch({ type: "billType", payload: value });
                    }}>
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
                      <Select value={field.value ? String(field.value) : undefined} onValueChange={(val) => {
                        const point = Number(val);
                        field.onChange(point);
                        // Immediate context sync (Jero): checkout uses this point of sale
                        dispatch({ type: "setState", payload: { ...billStateRef.current, ptoVenta: point, billType: watchBillTypeField } });
                      }}>
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
                  <span
                    className={cn(
                      "text-[11px] font-mono text-gray-400",
                      !loadingVoucher && lastVoucherNum === null && "text-red-400"
                    )}
                    title={voucherErrorMessage ?? undefined}
                  >
                    {loadingVoucher
                      ? "..."
                      : lastVoucherNum !== null
                        ? `${String(watchPtoVenta).padStart(3, '0')}-${String(lastVoucherNum + 1).padStart(4, '0')}`
                        : "Error"}
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
                    <Select {...field} onValueChange={(value) => {
                      field.onChange(value);
                      dispatch({ type: "billType", payload: value });
                    }}>
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
                      <Select value={field.value ? String(field.value) : undefined} onValueChange={(v) => {
                        const point = Number(v);
                        field.onChange(point);
                        dispatch({ type: "setState", payload: { ...billStateRef.current, ptoVenta: point, billType: watchBillTypeField } });
                      }}>
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
                Próximo:{" "}
                {loadingVoucher
                  ? "..."
                  : lastVoucherNum !== null
                    ? `${String(watchPtoVenta).padStart(3, '0')}-${String(lastVoucherNum + 1).padStart(4, '0')}`
                    : "—"}
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

              {/* Descuento: se edita desde DiscountControl en la sección de Totales (Jero bca1230/0c30043) */}
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
          {voucherErrorAlert}
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
            {BillState.discount > 0 && (
              <>
                <span>·</span>
                <span>-{BillState.discount}%</span>
              </>
            )}
          </div>
        </button>
        {mobileOpen && (
          <div className="pt-3 pb-1">
            {formContent}
            {voucherErrorAlert}
          </div>
        )}
      </div>
    </>
  );
};

export default BillParametersForm;
